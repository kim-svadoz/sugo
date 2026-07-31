import { apiJson, withUserId } from "./client.js";

// §3.3: PUBLIC routes (dashboard owns structure/order) - userId via query.
function path(workspace: string, suffix: string): string {
  return `/api/workspaces/${encodeURIComponent(workspace)}/roadmap${suffix}`;
}

export function setManualStatus(userId: string, workspace: string, nodeId: string, status: string) {
  return apiJson(withUserId(path(workspace, "/manual-status"), userId), {
    method: "POST",
    body: JSON.stringify({ nodeId, status }),
  });
}

export function clearManualStatus(userId: string, workspace: string, nodeId: string) {
  return apiJson(withUserId(path(workspace, "/manual-status"), userId), {
    method: "DELETE",
    body: JSON.stringify({ nodeId }),
  });
}

/** §7 폐기/복구 — 삭제가 아니라 manual_status='dropped' override(BFS cascade). */
export function dropSubtree(userId: string, workspace: string, nodeId: string) {
  return apiJson<{ ok: boolean; affected: string[] }>(withUserId(path(workspace, "/drop"), userId), {
    method: "POST",
    body: JSON.stringify({ nodeId }),
  });
}

export function restoreSubtree(userId: string, workspace: string, nodeId: string) {
  return apiJson<{ ok: boolean; affected: string[] }>(withUserId(path(workspace, "/restore"), userId), {
    method: "POST",
    body: JSON.stringify({ nodeId }),
  });
}

/** §7 orphan RUN → Spec 편입/분리. specId가 null이면 분리(미분류). */
export function assignRunToSpec(userId: string, workspace: string, runId: string, specId: string | null) {
  return apiJson<{ ok: boolean }>(withUserId(path(workspace, "/run-spec"), userId), {
    method: "POST",
    body: JSON.stringify({ runId, specId }),
  });
}
