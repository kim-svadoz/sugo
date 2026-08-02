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

/** §3.3 노드 이름 변경(✎). 대시보드가 구조·표시명을 소유한다. */
export function renameRoadmapNode(userId: string, workspace: string, nodeId: string, title: string) {
  return apiJson<{ ok: boolean }>(withUserId(path(workspace, "/rename"), userId), {
    method: "POST",
    body: JSON.stringify({ nodeId, title }),
  });
}

/** §3.3 `GET /:name/spec-content` — SPEC 원문(PRD) 팝업. 없으면 null. */
export async function getSpecContent(userId: string, workspace: string, title: string) {
  try {
    return await apiJson<{ title: string; content: string | null }>(
      withUserId(`/api/workspaces/${encodeURIComponent(workspace)}/spec-content`, userId, { title }),
    );
  } catch {
    // 404 = 원문이 없다. 화면에서 "없음"으로 안내하고 넘어간다(모달 자체를 막지 않는다).
    return null;
  }
}

/**
 * 의존 삭제(설계안 `DeletableEdge`의 ✕). **캔버스에서 하는 유일한 구조 변경**이다 —
 * §5.1대로 캔버스는 읽기전용 뷰어라 노드 이동·링크 생성은 여기서 하지 않는다.
 * (백엔드에는 `POST /roadmap/position`·`/link`도 있지만 화면이 쓰지 않는다.)
 */
export function unlinkRoadmapNodes(userId: string, workspace: string, from: string, to: string) {
  return apiJson(withUserId(path(workspace, "/link"), userId), {
    method: "DELETE",
    body: JSON.stringify({ from, to }),
  });
}
