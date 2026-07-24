import { apiJson, withUserId } from "./client.js";

// §3.3: PUBLIC routes (dashboard owns structure/order) - userId via query.
function path(workspace: string, suffix: string): string {
  return `/api/workspaces/${encodeURIComponent(workspace)}/canvas${suffix}`;
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
