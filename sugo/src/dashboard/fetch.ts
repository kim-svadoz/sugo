import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
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
  project_path?: string | null;
  spec_path?: string | null;
  depends_on?: string[];
  manual_status?: string | null;
  pos_x?: number | null;
  pos_y?: number | null;
}

export interface RemoteBlockerDecision {
  status: string;
  blocker: { sessionId?: string; resumeAction?: string } | null;
  decision: { response: string; answered_by: string; answered_at: string } | null;
}

export async function fetchBlockerDecision(workspaceName: string, nodeId: string): Promise<RemoteBlockerDecision | null> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return null;
  const qs = new URLSearchParams({ nodeId });
  if (config.userId) qs.set("userId", config.userId);
  return fetchJson<RemoteBlockerDecision>(
    `/api/workspaces/${encodeURIComponent(workspaceName)}/roadmap/blocker-decision?${qs.toString()}`,
    8000,
  );
}

export interface UnlinkedSpecDraft {
  id: string;
  title: string;
  dueDate: string | null;
  projectPath: string | null;
  specPath: string | null;
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
    .map((node) => ({
      id: node.id,
      title: node.title ?? node.id,
      dueDate: node.due_date ?? null,
      projectPath: node.project_path ?? null,
      specPath: node.spec_path ?? null,
    }));
}

/** Schedule SPEC에 붙여 넣은 기획 화면을 destDir로 내려받아 로컬 경로를 돌려준다.
 * 대시보드가 원격이어도 spec-writer가 파일로 읽고 spec 버전 디렉터리에 복사할 수 있게 매번 새로 받는다.
 * 첨부 API가 없는 구버전 Console이거나 대시보드가 꺼져 있으면 null. */
export async function downloadSpecAttachments(workspaceName: string, nodeId: string, destDir: string): Promise<string[] | null> {
  const ws = encodeURIComponent(workspaceName);
  const qs = `nodeId=${encodeURIComponent(nodeId)}`;
  const list = await fetchJson<{ attachments: Array<{ name: string }> }>(`/api/workspaces/${ws}/roadmap/spec-attachments?${qs}`, 8000);
  const config = await resolveDashboardConfig();
  if (!list || !config.enabled || !config.apiUrl) return null;
  const headers = config.apiToken ? { Authorization: `Bearer ${config.apiToken}` } : undefined;
  await rm(destDir, { recursive: true, force: true });
  if (list.attachments.length === 0) return [];
  await mkdir(destDir, { recursive: true });
  const paths: string[] = [];
  for (const { name } of list.attachments) {
    const res = await fetch(`${config.apiUrl}/api/workspaces/${ws}/roadmap/spec-attachments/file?${qs}&name=${encodeURIComponent(name)}`, { headers });
    if (!res.ok) throw new Error(`SPEC_ATTACHMENT_DOWNLOAD_FAILED:${name}:${res.status}`);
    const target = join(destDir, name);
    await writeFile(target, Buffer.from(await res.arrayBuffer()));
    paths.push(target);
  }
  return paths;
}

/** spec-writer 완료는 다음 fetch에서 재시도하면 되는 조회가 아니라 사용자가 기다리는 제어 경로다. */
export async function attachSpecDocument(workspaceName: string, nodeId: string, specPath: string): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled || !config.apiUrl) throw new Error("DASHBOARD_DISABLED");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiToken) headers.Authorization = `Bearer ${config.apiToken}`;
  const res = await fetch(`${config.apiUrl}/api/workspaces/${encodeURIComponent(workspaceName)}/roadmap/spec-document`, {
    method: "POST",
    headers,
    body: JSON.stringify({ nodeId, specPath }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`SPEC_DOCUMENT_ATTACH_FAILED:${res.status}:${body}`);
  }
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

export interface DashboardAwsInventoryResource {
  kind: string;
  id: string;
}

export interface DashboardAwsServiceInventory {
  service: string;
  resources: DashboardAwsInventoryResource[];
  error?: string;
}

export interface DashboardAwsContext {
  connected: boolean;
  activeAccount?: string | null;
  profile: string | null;
  region: string | null;
  accountHint: string | null;
  principal: string | null;
  observedAt: string | null;
  inventory: DashboardAwsServiceInventory[];
}

/** Dashboard가 보관한 마지막 AWS 인벤토리 스냅샷만 읽는다.
 * 에이전트가 AWS를 직접 조회하거나 자동 새로고침하지 않아 비용·지연·권한 범위를 넓히지 않는다. */
export async function fetchAwsContext(account = "default"): Promise<DashboardAwsContext | null> {
  return fetchJson<DashboardAwsContext>(`/api/aws-context?account=${encodeURIComponent(account)}`, 8000);
}
