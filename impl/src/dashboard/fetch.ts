import { resolveDashboardConfig } from "./config.js";

/**
 * §7.2 fetch(블로킹, 3~10s): 실패/disabled면 전부 null로 안전 폴백한다(호출부가 로컬 상태를
 * 그대로 쓰면 된다) — 대시보드 다운이 파이프라인을 막지 않는다는 push쪽과 같은 원칙을 fetch
 * 쪽에서도 지킨다. push와 달리 재시도 큐에 쌓지 않는다(다음에 또 fetch하면 그만이라 큐가 필요 없다).
 */
async function fetchJson<T>(path: string, timeoutMs: number): Promise<T | null> {
  const config = await resolveDashboardConfig();
  if (!config.enabled || !config.apiUrl) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.apiUrl}${path}`, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface RemoteRoadmapOrdering {
  id: string;
  dependsOn: string[];
  manual_status?: string;
  pos_x?: number;
  pos_y?: number;
}

/** GET /api/workspaces/{ws}/roadmap?userId= — §7.2 "대시보드=순서의 SOT". */
export async function fetchRoadmapOrdering(workspaceName: string): Promise<RemoteRoadmapOrdering[] | null> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return null;
  const qs = config.userId ? `?userId=${encodeURIComponent(config.userId)}` : "";
  return fetchJson<RemoteRoadmapOrdering[]>(`/api/workspaces/${encodeURIComponent(workspaceName)}/roadmap${qs}`, 8000);
}

export interface RemoteCheckpoint {
  id: string;
  title: string;
  category?: string;
  applies_to?: string[];
  checklist: string[];
}

/** GET /api/workspaces/checkpoint-sync?userId= — 대시보드→로컬 체크포인트 pull. */
export async function fetchCheckpointSync(): Promise<RemoteCheckpoint[] | null> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return null;
  const qs = config.userId ? `?userId=${encodeURIComponent(config.userId)}` : "";
  return fetchJson<RemoteCheckpoint[]>(`/api/workspaces/checkpoint-sync${qs}`, 8000);
}

/** GET /api/metrics/calibrated-ratio — 인간공수 보정비율 헬스(humanHours.ts의 고정 3.5 대체용). */
export async function fetchCalibratedRatio(): Promise<number | null> {
  const result = await fetchJson<{ ratio: number }>("/api/metrics/calibrated-ratio", 5000);
  return result?.ratio ?? null;
}
