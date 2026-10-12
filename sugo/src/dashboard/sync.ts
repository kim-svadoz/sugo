import { pushEvent } from "./client.js";
import { resolveDashboardConfig } from "./config.js";
import {
  serializeRoadmapSnapshot,
  serializeCheckpoint,
  serializeDecision,
  serializeHistory,
  serializeTask,
} from "./serialize.js";
import type { Checkpoint, RoadmapNode, Spec, Task, Workspace, WorkLog } from "../hulk/types.js";
import type { PrRefs } from "../prRefs.js";
import type { RoadmapWorkResult } from "../hulk/types.js";

/**
 * §7.2 push 엔드포인트 얇은 래퍼들 — 호출부(hulk/*.ts, tools/sugoPlan.ts)는 로컬 쓰기가 끝난 뒤
 * `void syncXxx(...)`처럼 기다리지 않고 호출한다. pushEvent 자체가 disabled/실패를 조용히
 * 흡수하므로 이 래퍼들도 절대 던지지 않는다.
 *
 * **wire 포맷:** 대시보드가 기대하는 평평한 camelCase 페이로드로의 변환은 serialize.ts가
 * 담당한다(왜 필요한지는 그 파일 주석 참고). 경로는 양쪽 다 `roadmap`으로 일치한다(v2/D1).
 */

export async function syncWorkspace(ws: Workspace): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/workspace", "POST", {
    userId: config.userId,
    name: ws.name,
    projects: ws.projects,
    gitSyncedProjects: [],
    createdAt: ws.created_at,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * §8.2 soft delete sync — `DELETE /api/sync/workspace`. 기본은 soft(대시보드가 `deleted_at`을
 * 찍고 목록에서 숨긴다), `purge:true`면 관련 행을 하드 삭제한다.
 *
 * 로컬에서 지웠는데 대시보드에 그대로 남아 있으면 사용자가 보는 상태와 실제 상태가 갈라진다
 * (`user-truth` 불변식). 다른 push와 똑같이 fire-and-forget이라 실패해도 큐에 쌓일 뿐이다.
 */
export async function deleteWorkspaceSync(name: string, options: { purge?: boolean } = {}): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/workspace", "DELETE", {
    userId: config.userId,
    name,
    ...(options.purge ? { purge: true } : {}),
  });
}

export async function syncTask(workspaceName: string, task: Task): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/task", "POST", serializeTask(config.userId, workspaceName, task));
}

/** §7.2 "노드 스냅샷 replace" — 부분 patch가 아니라 매번 전체 노드 목록을 통째로 보낸다(대시보드가 diff한다).
 */
export async function syncRoadmapSnapshot(workspaceName: string, nodes: RoadmapNode[]): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/roadmap", "POST", serializeRoadmapSnapshot(config.userId, workspaceName, nodes));
}

/** §7.2 `/api/sync/checkpoint` push 방향 — sugo_checkpoint(action:'sync')가 사용한다. pull 방향은
 * dashboard/fetch.ts의 fetchCheckpointSync + sugo_checkpoint(action:'pull')이 담당한다. */
export async function syncCheckpoint(workspaceName: string, checkpoint: Checkpoint): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/checkpoint", "POST", serializeCheckpoint(config.userId, workspaceName, checkpoint));
}

/** §7.2 `/api/sync/history` — WorkLog(완료 작업 요약) push. prRefs는 roadmap 노드 workResult.prRefs로
 * 흐르는 게 정본이라(대시보드 history 스키마엔 prRefs 필드 없음) 여기선 실어보내지 않는다.
 * (호출부 하위호환을 위해 prRefs 인자는 유지하되 사용하지 않는다.) */
export async function syncHistory(workspaceName: string, workLog: WorkLog, _prRefs?: PrRefs | null): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/history", "POST", serializeHistory(config.userId, workspaceName, workLog));
}

/** §7.2 `/api/sync/decision`(ADR) — sugo_spec(add)가 트리거한다. Spec을 그대로 "결정 기록"으로 취급한다. */
export async function syncDecision(workspaceName: string, spec: Spec): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/decision", "POST", serializeDecision(config.userId, workspaceName, spec));
}

/** §7.2 `/api/sync/plugin-version` — 서버 기동 시 1회. */
export async function syncPluginVersion(version: string): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/plugin-version", "POST", { userId: config.userId, version });
}

/** §7.2 `/api/sync/user` — 서버 기동 시 1회(플러그인 버전과 같은 타이밍). */
export async function syncUser(): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/user", "POST", { userId: config.userId });
}

/**
 * §7.2 `/api/sync/workspace-meta` — 워크스페이스 표시 설정 등 메타데이터. **의도적으로 자동 호출
 * 지점을 안 붙였다:** 스펙의 "대시보드 소유 필드"(manual_status/pos_x/pos_y와 같은 성격)에 더
 * 가까워 보이는데, 로컬 플러그인이 뭘 밀어넣어야 하는지 스펙에 구체적으로 안 나와 있다. 계약
 * 함수만 마련해두고(다른 push 래퍼와 동일 패턴), 실제로 무엇을 보낼지는 대시보드 스펙 문서가
 * 확보되면 그때 호출부를 붙이는 게 안전하다(추측성 배선 금지).
 */
export async function syncWorkspaceMeta(workspaceName: string, meta: Record<string, unknown>): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/workspace-meta", "POST", { userId: config.userId, workspaceName, meta });
}

/** §7.2 `/api/sync/roadmap/link` + DELETE — link/unlink 전용 이벤트(스냅샷 replace와 별개로,
 * 대시보드가 "이 링크가 방금 편집됐다"는 이벤트 자체를 받고 싶을 때를 위한 보조 신호).
 */
export async function syncRoadmapLink(workspaceName: string, fromId: string, toId: string): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/roadmap/link", "POST", { userId: config.userId, workspaceName, fromId, toId });
}

export async function unsyncRoadmapLink(workspaceName: string, fromId: string, toId: string): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/roadmap/link", "DELETE", { userId: config.userId, workspaceName, fromId, toId });
}

export async function syncReviewArtifacts(
  workspaceName: string,
  taskId: string,
  sessionId: string,
  patchVersion: number,
  files: NonNullable<RoadmapWorkResult["files"]>,
): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await Promise.all(files.map((file) =>
    pushEvent("/api/sync/review-artifact", "POST", {
      userId: config.userId, workspaceName, taskId, sessionId, patchVersion, ...file,
    }, 15_000),
  ));
}
