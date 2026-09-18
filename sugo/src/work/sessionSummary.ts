import type { PlanSession } from "../types.js";

export interface SessionSummary {
  sessionId: string;
  state: string;
  featureName?: string;
  projectPath: string;
  startedAt?: string;
  updatedAt?: string;
  cancelledAt?: string;
  /**
   * 이어받을 수 있는 세션. 완주(`DONE`)도 취소도 아닌 것만 해당한다.
   *
   * **취소는 상태가 아니라 `cancelledAt` 타임스탬프다** — `cancel` 액션은 `state`를 그대로 두고
   * 이 필드만 찍는다(planStateMachine.ts). 상태값만 보고 판정하면 취소된 세션이 영원히
   * "이어받을 수 있음"으로 남는다.
   */
  resumable: boolean;
  /** 왜 멈춰 있는지 한눈에 보기 위한 최소 신호. 없는 값은 싣지 않는다. */
  blockers: string[];
  changedFileCount?: number;
}

/**
 * 세션 하나를 터미널에 뿌릴 만한 크기로 줄인다. PRD 본문·핸드오프 전문 같은 큰 필드는 버리고,
 * "지금 어디서 왜 멈췄나"에 답하는 것만 남긴다 — 워크스페이스 대시보드가 세션 수십 개를 한 번에
 * 보여줘야 하므로 개별 세션을 통째로 실으면 터미널에서 읽을 수 없다.
 */
export function summarizeSession(session: PlanSession): SessionSummary {
  const chain = session.data?.chainInfo;
  const blockers: string[] = [];

  const evidence = chain?.testEvidence;
  if (evidence?.failed) blockers.push(`테스트 실패 ${evidence.failed}/${evidence.total ?? "?"}`);
  if (chain?.analyzePassed === false) blockers.push("analyze 미통과");
  if (chain?.reviewPassed === false) blockers.push("review 미통과");
  if (chain?.autoLoopRetryCount) blockers.push(`review 재시도 ${chain.autoLoopRetryCount}회`);

  return {
    sessionId: session.id,
    state: session.state,
    featureName: session.featureName,
    projectPath: session.projectPath,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    ...(session.cancelledAt ? { cancelledAt: session.cancelledAt } : {}),
    resumable: session.state !== "DONE" && !session.cancelledAt,
    blockers,
    ...(chain?.changedFiles ? { changedFileCount: chain.changedFiles.length } : {}),
  };
}

/**
 * 워크스페이스에 속한 프로젝트들의 세션만 골라 최신순으로 돌려준다.
 *
 * 세션은 `projectPath`만 알고 워크스페이스를 모른다(§8에서 워크스페이스는 레지스트리가 매핑한다).
 * 그래서 소속 판정은 호출부가 넘긴 경로 집합으로만 한다 — 여기서 레지스트리를 다시 읽으면
 * 등록이 해제된 프로젝트의 세션이 워크스페이스에서 조용히 사라진다.
 */
export function sessionsForProjects(sessions: PlanSession[], projectPaths: string[]): SessionSummary[] {
  const paths = new Set(projectPaths);
  return sessions
    .filter((s) => paths.has(s.projectPath))
    .map(summarizeSession)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}
