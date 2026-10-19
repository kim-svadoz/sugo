import { resolveDashboardConfig } from "./config.js";
import { enqueueRetry, processRetryQueue, type RetryItem, type DeliveryResult } from "./retryQueue.js";
import { compactRoadmapPayload } from "./serialize.js";
import { DASHBOARD_SYNC_SCHEMA_VERSION, SYNC_SCHEMA_VERSION_HEADER } from "./schemaVersion.js";

const DEFAULT_TIMEOUT_MS = 5000;
export const MAX_ROADMAP_PAYLOAD_BYTES = 1024 * 1024;

export function classifyHttpFailure(status: number): DeliveryResult {
  return { ok: false, httpStatus: status, reason: `HTTP ${status}`, permanent: [400, 404, 405, 410, 413, 415, 422].includes(status) };
}

/**
 * schemaVersion 주입 — **여기 한 곳**에서만 붙인다. 래퍼마다 손으로 달면 새 엔드포인트를
 * 추가할 때 빠뜨리고, 빠뜨려도 아무도 안 죽어서(fail-open) 조용히 계약이 갈라진다. 아웃바운드가
 * 전부 pushEvent를 거치므로(`no-fetch-bypass` 불변식) 여기가 유일한 관문이다.
 *
 * 호출부가 명시한 값은 존중한다(마이그레이션 중 특정 이벤트만 다른 계약으로 보내야 할 때).
 */
function withSchemaVersion(data: unknown): unknown {
  if (data === null || typeof data !== "object" || Array.isArray(data)) return data;
  const obj = data as Record<string, unknown>;
  if (obj.schemaVersion !== undefined) return obj;
  return { ...obj, schemaVersion: DASHBOARD_SYNC_SCHEMA_VERSION };
}

/** 역방향 degrade: 서버가 우리보다 새 계약이면 1회만 경고한다(매 이벤트마다 짖으면 로그가 죽는다). */
let warnedNewerServer = false;
function noteServerSchemaVersion(res: Response): void {
  const raw = res.headers.get(SYNC_SCHEMA_VERSION_HEADER);
  if (!raw) return;
  const server = Number(raw);
  if (!Number.isInteger(server) || server <= DASHBOARD_SYNC_SCHEMA_VERSION || warnedNewerServer) return;
  warnedNewerServer = true;
  console.warn(
    `[sugo] 대시보드 sync 계약이 더 최신입니다(server=${server}, plugin=${DASHBOARD_SYNC_SCHEMA_VERSION}). ` +
      "플러그인 업데이트를 권장합니다 — 동기화는 계속 진행합니다.",
  );
}

async function sendOnce(apiUrl: string, endpoint: string, method: "POST" | "DELETE", data: unknown, timeoutMs: number, apiToken?: string): Promise<DeliveryResult> {
  const isRoadmap = endpoint === "/api/sync/roadmap" && method === "POST";
  const body = JSON.stringify(withSchemaVersion(isRoadmap ? compactRoadmapPayload(data) : data));
  if (isRoadmap && Buffer.byteLength(body, "utf8") > MAX_ROADMAP_PAYLOAD_BYTES) {
    return { ok: false, reason: "ROADMAP_PAYLOAD_TOO_LARGE (limit 1MiB)", permanent: true };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // 공개 SaaS 대시보드는 Bearer API 토큰으로 신원을 확정한다(body userId는 서버가 무시).
    if (apiToken) headers.Authorization = `Bearer ${apiToken}`;
    const res = await fetch(`${apiUrl}${endpoint}`, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    noteServerSchemaVersion(res);
    return res.ok ? { ok: true } : classifyHttpFailure(res.status);
  } catch {
    return { ok: false, reason: "network error or timeout" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * fire-and-forget POST/DELETE: 대시보드가 꺼져있거나(disabled) 다운돼있어도 이 함수는
 * 절대 던지지 않는다 — 실패하면 조용히 재시도 큐에 쌓아둘 뿐이다("대시보드 다운이 파이프라인을
 * 막지 않는다"). 호출부는 `void pushEvent(...)`처럼 기다리지 않고 흘려보내도 되고, 재시도
 * 큐잉까지 확실히 끝난 뒤 다음 코드로 넘어가고 싶으면 await해도 안전하다(둘 다 던지지 않음).
 */
export async function pushEvent(endpoint: string, method: "POST" | "DELETE", data: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled || !config.apiUrl) return;
  // 버전을 먼저 붙여두고 그 값을 전송·큐잉 양쪽에 쓴다 — WAL에 "실제로 전선에 나갈 것"과
  // 똑같은 바이트가 남아야 재전송이 첫 전송과 같은 계약으로 나간다.
  const payload = withSchemaVersion(data);
  const ok = await sendOnce(config.apiUrl, endpoint, method, payload, timeoutMs, config.apiToken);
  if (!ok.ok) await enqueueRetry(endpoint, method, payload, ok);
}

/** 재시도 큐를 한 바퀴 돌며 재전송을 시도한다. disabled면(설정이 그 사이 꺼졌으면) 아무 것도 안 보내고 그대로 큐에 둔다. */
export async function drainRetryQueue(): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled || !config.apiUrl) return;
  const apiUrl = config.apiUrl;
  const apiToken = config.apiToken;
  await processRetryQueue((item: RetryItem) => sendOnce(apiUrl, item.endpoint, item.method, item.data, DEFAULT_TIMEOUT_MS, apiToken));
}
