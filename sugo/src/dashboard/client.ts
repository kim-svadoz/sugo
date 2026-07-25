import { resolveDashboardConfig } from "./config.js";
import { enqueueRetry, processRetryQueue, type RetryItem } from "./retryQueue.js";

const DEFAULT_TIMEOUT_MS = 5000;

async function sendOnce(apiUrl: string, endpoint: string, method: "POST" | "DELETE", data: unknown, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${apiUrl}${endpoint}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * §7.2 fire-and-forget POST/DELETE: 대시보드가 꺼져있거나(disabled) 다운돼있어도 이 함수는
 * 절대 던지지 않는다 — 실패하면 조용히 재시도 큐에 쌓아둘 뿐이다("대시보드 다운이 파이프라인을
 * 막지 않는다"). 호출부는 `void pushEvent(...)`처럼 기다리지 않고 흘려보내도 되고, 재시도
 * 큐잉까지 확실히 끝난 뒤 다음 코드로 넘어가고 싶으면 await해도 안전하다(둘 다 던지지 않음).
 */
export async function pushEvent(endpoint: string, method: "POST" | "DELETE", data: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled || !config.apiUrl) return;
  const ok = await sendOnce(config.apiUrl, endpoint, method, data, timeoutMs);
  if (!ok) await enqueueRetry(endpoint, method, data);
}

/** 재시도 큐를 한 바퀴 돌며 재전송을 시도한다. disabled면(설정이 그 사이 꺼졌으면) 아무 것도 안 보내고 그대로 큐에 둔다. */
export async function drainRetryQueue(): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled || !config.apiUrl) return;
  const apiUrl = config.apiUrl;
  await processRetryQueue((item: RetryItem) => sendOnce(apiUrl, item.endpoint, item.method, item.data, DEFAULT_TIMEOUT_MS));
}
