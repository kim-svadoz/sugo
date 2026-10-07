import { apiFetch, apiJson, withUserId } from "./client.js";

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

// ── §7B Schedule 탭 ─────────────────────────────────────────────────────────
// due_date는 항상 화면에서만 입력한다(2026-09-23 사용자 결정) — sugo_plan CLI는 이 경로를 모른다.

export interface ScheduledSpec {
  deployment?: import("../lib/specDeployment.js").SpecDeployment;
  id: string;
  workspace_name: string;
  title: string;
  status: string;
  due_date: string | null;
  project_path: string | null;
  work_branch?: string | null;
  spec_path: string | null;
  has_run: boolean;
  task_count?: number;
  done_task_count?: number;
  active_task_count?: number;
  blocked_task_count?: number;
  stale_task_count?: number;
  unverified_task_count?: number;
  focus_task_id?: string | null;
  focus_task_title?: string | null;
  focus_task_status?: string | null;
  focus_task_note?: string | null;
  focus_task_updated_at?: string | null;
  focus_task_work_result?: unknown;
  focus_task_runtime_assessment?: import("../lib/taskGuidance.js").RuntimeAssessment | null;
  focus_task_blocker_decision?: BlockerDecision | null;
  focus_task_human_blocker?: HumanBlocker | null;
}

export interface BlockerDecision { response: string; answered_by: string; answered_at: string }
export interface HumanBlocker {
  schemaVersion: 1;
  sessionId: string;
  stage: string;
  resumeAction: string;
  summary: string;
  question: string;
  context: string[];
  options: Array<{ id: string; label: string; impact: string }>;
  blockedNextStep: string;
  createdAt: string;
}

export function saveBlockerDecision(userId: string, workspace: string, nodeId: string, response: string) {
  return apiJson<{ ok: true; decision: BlockerDecision }>(withUserId(path(workspace, "/blocker-decision"), userId), {
    method: "POST",
    body: JSON.stringify({ nodeId, response }),
  });
}

/** 로그인 사용자의 전체 워크스페이스에서 level='spec' 노드를 가로질러 가져온다.
 * `/:name/...`이 아니라 워크스페이스 비종속 엔드포인트다. */
export async function getSchedule(userId: string): Promise<ScheduledSpec[]> {
  const res = await apiJson<{ specs: ScheduledSpec[] }>(withUserId("/api/workspaces/schedule", userId));
  return res.specs;
}

/** level='spec' 노드에만 적용 가능. dueDate=null이면 "기한 미정"으로 되돌린다.
 * 실패(404/400)는 apiJson이 그대로 throw한다 — 호출부에서 잡아 안내한다. */
export function setDueDate(userId: string, workspace: string, nodeId: string, dueDate: string | null) {
  return apiJson<{ ok: true }>(withUserId(path(workspace, "/due-date"), userId), {
    method: "POST",
    body: JSON.stringify({ nodeId, dueDate }),
  });
}

/** level='spec' 노드에만 적용 가능. projectPath=null이면 "프로젝트 미지정"으로 되돌린다. */
export function setProject(userId: string, workspace: string, nodeId: string, projectPath: string | null) {
  return apiJson<{ ok: true }>(withUserId(path(workspace, "/project"), userId), {
    method: "POST",
    body: JSON.stringify({ nodeId, projectPath }),
  });
}

export function setWorkBranch(userId: string, workspace: string, nodeId: string, workBranch: string | null) {
  return apiJson<{ ok: true }>(withUserId(path(workspace, "/work-branch"), userId), {
    method: "POST",
    body: JSON.stringify({ nodeId, workBranch }),
  });
}

export interface SpecDocument {
  ok: true;
  specPath: string;
  content: string;
  locked: boolean;
}

export function getSpecDocument(userId: string, workspace: string, nodeId: string) {
  return apiJson<SpecDocument>(withUserId(path(workspace, "/spec-document"), userId, { nodeId }));
}

export function updateSpecDocument(userId: string, workspace: string, nodeId: string, content: string) {
  return apiJson<SpecDocument>(withUserId(path(workspace, "/spec-document"), userId), {
    method: "PUT",
    body: JSON.stringify({ nodeId, content }),
  });
}

/** Run/Task 없이 level='spec' 노드만 단독 생성한다("+ 일정 추가"). */
export function createQuickSpec(
  userId: string,
  workspace: string,
  title: string,
  dueDate?: string | null,
  projectPath?: string | null
) {
  return apiJson<{ ok: boolean; id: string }>(withUserId(path(workspace, "/quick-spec"), userId), {
    method: "POST",
    body: JSON.stringify({ title, dueDate, projectPath }),
  });
}

/** Dashboard가 만든 수동 SPEC과 그 하위 계보만 삭제한다. 로컬 Markdown 파일은 보존된다. */
export function deleteQuickSpec(userId: string, workspace: string, nodeId: string) {
  return apiJson<{ ok: true; deletedCount: number; filesPreserved: true }>(withUserId(path(workspace, "/quick-spec"), userId), {
    method: "DELETE",
    body: JSON.stringify({ nodeId }),
  });
}

/** Schedule SPEC에 붙여 넣은 기획 화면. spec-writer가 읽어 spec.md 버전 디렉터리로 복사한다. */
export interface SpecAttachmentList {
  ok: true;
  locked: boolean;
  attachments: Array<{ name: string; path: string }>;
}

export function listSpecAttachments(userId: string, workspace: string, nodeId: string) {
  return apiJson<SpecAttachmentList>(withUserId(path(workspace, "/spec-attachments"), userId, { nodeId }));
}

export function uploadSpecAttachment(userId: string, workspace: string, nodeId: string, file: Blob) {
  return apiJson<{ ok: true; name: string }>(withUserId(path(workspace, "/spec-attachments"), userId, { nodeId }), {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
  });
}

export function deleteSpecAttachment(userId: string, workspace: string, nodeId: string, name: string) {
  return apiJson<{ ok: true }>(withUserId(path(workspace, "/spec-attachments"), userId, { nodeId, name }), { method: "DELETE" });
}

async function blobUrl(url: string): Promise<string> {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`API ${url} failed: ${res.status}`);
  return URL.createObjectURL(await res.blob());
}

/** 이미지 API는 Bearer 인증이라 <img src>로 직접 못 부른다 — blob URL로 받아 쓴다. 다 쓰면 revokeObjectURL. */
export function specAttachmentBlobUrl(userId: string, workspace: string, nodeId: string, name: string) {
  return blobUrl(withUserId(path(workspace, "/spec-attachments/file"), userId, { nodeId, name }));
}

export function specDocumentAssetBlobUrl(userId: string, workspace: string, nodeId: string, assetPath: string) {
  return blobUrl(withUserId(path(workspace, "/spec-document/asset"), userId, { nodeId, path: assetPath }));
}
