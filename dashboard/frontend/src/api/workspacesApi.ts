import { apiJson, withUserId } from "./client.js";

export interface RecentHistoryRow {
  id: string;
  workspace_name: string;
  task_id: string | null;
  task_title: string | null;
  summary: string | null;
  completed_at: string | null;
  created_at: string;
}

export async function getRecentHistory(userId: string, limit: number): Promise<RecentHistoryRow[]> {
  const res = await apiJson<{ history: RecentHistoryRow[] }>(
    withUserId("/api/workspaces/recent-history", userId, { limit: String(limit) })
  );
  return res.history;
}

/** §3.3 체크포인트 CRUD — 설계안 Checkpoints 모달의 편집 경로. */
export interface CheckpointInput {
  id?: string;
  category?: string;
  title: string;
  learnedFrom?: string | null;
  checklist?: string[];
  appliesTo?: string[];
}

function cpPath(workspace: string, suffix = ""): string {
  return `/api/workspaces/${encodeURIComponent(workspace)}/checkpoints${suffix}`;
}

export function createWorkspaceCheckpoint(userId: string, workspace: string, body: CheckpointInput) {
  return apiJson<{ ok: boolean }>(withUserId(cpPath(workspace), userId), { method: "POST", body: JSON.stringify(body) });
}

export function updateWorkspaceCheckpoint(userId: string, workspace: string, id: string, body: Partial<CheckpointInput>) {
  return apiJson<{ ok: boolean }>(withUserId(cpPath(workspace, `/${encodeURIComponent(id)}`), userId), {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function deleteWorkspaceCheckpoint(userId: string, workspace: string, id: string) {
  return apiJson<{ ok: boolean }>(withUserId(cpPath(workspace, `/${encodeURIComponent(id)}`), userId), { method: "DELETE" });
}
