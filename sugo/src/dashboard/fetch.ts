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
    // 공개 SaaS 대시보드는 Bearer 토큰으로 신원 확정(fetch 엔드포인트도 인증 강제).
    const headers = config.apiToken ? { Authorization: `Bearer ${config.apiToken}` } : undefined;
    const res = await fetch(`${config.apiUrl}${path}`, { signal: controller.signal, headers });
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

/** 대시보드 roadmap 노드 응답 형태(snake_case, depends_on 등). fetch 어댑터가 이걸 plugin의
 * camelCase RemoteRoadmapOrdering으로 번역한다. */
interface RoadmapNodeResponse {
  id: string;
  title?: string;
  level?: string;
  status?: string;
  parent?: string | null;
  due_date?: string | null;
  depends_on?: string[];
  manual_status?: string | null;
  pos_x?: number | null;
  pos_y?: number | null;
}

export interface UnlinkedSpecDraft {
  id: string;
  title: string;
  dueDate: string | null;
}

/** Dashboard에서 먼저 만든 최상위 SPEC 중 아직 하위 Run이 없는 feat 연결 후보만 가져온다. */
export async function fetchUnlinkedSpecDrafts(workspaceName: string): Promise<UnlinkedSpecDraft[] | null> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return null;
  const qs = config.userId ? `?userId=${encodeURIComponent(config.userId)}` : "";
  const res = await fetchJson<{ nodes: RoadmapNodeResponse[] }>(
    `/api/workspaces/${encodeURIComponent(workspaceName)}/roadmap${qs}`,
    8000,
  );
  if (!res) return null;
  const linkedSpecIds = new Set(
    res.nodes.filter((node) => node.level === "workstream" && node.parent).map((node) => node.parent as string),
  );
  return res.nodes
    .filter(
      (node) =>
        node.level === "spec" &&
        node.id.startsWith("spec-manual-") &&
        node.status !== "done" &&
        node.status !== "dropped" &&
        !linkedSpecIds.has(node.id),
    )
    .map((node) => ({ id: node.id, title: node.title ?? node.id, dueDate: node.due_date ?? null }));
}

/** GET /api/workspaces/{ws}/roadmap?userId= — §7.2 "대시보드=순서의 SOT".
 * 대시보드 응답은 `{nodes:[...]}`로 감싸며 snake_case(depends_on)를
 * 쓰므로, 이 경계에서 언랩 + camelCase 매핑을 한다(seam 어댑터). */
export async function fetchRoadmapOrdering(workspaceName: string): Promise<RemoteRoadmapOrdering[] | null> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return null;
  const qs = config.userId ? `?userId=${encodeURIComponent(config.userId)}` : "";
  const res = await fetchJson<{ nodes: RoadmapNodeResponse[] }>(
    `/api/workspaces/${encodeURIComponent(workspaceName)}/roadmap${qs}`,
    8000,
  );
  if (!res) return null;
  return res.nodes.map((n) => ({
    id: n.id,
    dependsOn: n.depends_on ?? [],
    manual_status: n.manual_status ?? undefined,
    pos_x: n.pos_x ?? undefined,
    pos_y: n.pos_y ?? undefined,
  }));
}

export interface RemoteCheckpoint {
  id: string;
  workspace_name?: string;
  title: string;
  category?: string;
  applies_to?: string[];
  checklist: string[];
  learned_from?: string;
  expires_at?: string;
}

interface CheckpointSyncResponse {
  id: string;
  workspace_name?: string;
  title: string;
  category?: string | null;
  applies_to?: string[] | null;
  checklist?: string[] | null;
  learned_from?: string | null;
  expires_at?: string | null;
}

/** GET /api/workspaces/checkpoint-sync?userId= — 대시보드→로컬 체크포인트 pull.
 * 대시보드가 `{checkpoints:[...]}`로 감싸고 applies_to(snake)를 쓰므로 언랩+매핑(seam 어댑터). */
export async function fetchCheckpointSync(workspaceName?: string): Promise<RemoteCheckpoint[] | null> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return null;
  const params = new URLSearchParams();
  if (config.userId) params.set("userId", config.userId);
  if (workspaceName) params.set("workspace", workspaceName);
  const qs = params.size ? `?${params.toString()}` : "";
  const res = await fetchJson<{ checkpoints: CheckpointSyncResponse[] }>(`/api/workspaces/checkpoint-sync${qs}`, 8000);
  if (!res) return null;
  return res.checkpoints.map((c) => ({
    id: c.id,
    workspace_name: c.workspace_name,
    title: c.title,
    category: c.category ?? undefined,
    applies_to: c.applies_to ?? undefined,
    checklist: c.checklist ?? [],
    learned_from: c.learned_from ?? undefined,
    expires_at: c.expires_at ?? undefined,
  }));
}

/** GET /api/metrics/calibrated-ratio — 인간공수 보정비율 헬스(humanHours.ts의 고정 3.5 대체용). */
export async function fetchCalibratedRatio(): Promise<number | null> {
  const result = await fetchJson<{ ratio: number }>("/api/metrics/calibrated-ratio", 5000);
  return result?.ratio ?? null;
}
