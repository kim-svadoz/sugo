import type { PlanSession } from "../types.js";

/**
 * ISO 시각을 실행 머신의 시간대로 포맷한다. 파싱할 수 없으면 undefined를 돌려준다 — 원본 ISO는
 * 그대로 남으므로 여기서 추측값을 만들어 넣지 않는다.
 */
function toLocalTime(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  // `dateStyle`/`timeStyle`은 `timeZoneName` 같은 개별 옵션과 함께 쓸 수 없다(Intl 스펙 제약 —
  // 섞으면 "Invalid option" TypeError). 그래서 컴포넌트를 하나씩 지정한다.
  // sv-SE 로캘이 `2026-09-18 15:31:51 GMT+9` 형태를 줘서 ISO에 가깝고 정렬·비교가 자연스럽다.
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(date);
}

export interface SessionSummary {
  sessionId: string;
  state: string;
  featureName?: string;
  projectPath: string;
  startedAt?: string;
  updatedAt?: string;
  /**
   * `updatedAt`을 실행 머신의 시간대로 포맷한 값(`2026-09-18 15:31:51 KST` 형태).
   *
   * 원본 ISO는 UTC라 사람이 "언제 멈췄나"를 바로 못 읽는다. 시간대를 하드코딩하지 않고 시스템
   * 설정을 따른다 — 플러그인은 배포물이라 특정 지역을 박으면 다른 환경에서 틀린 시각을 보여준다.
   */
  updatedAtLocal?: string;
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
  if (chain?.reviewPassed === false) blockers.push("review 미통과");
  if (chain?.autoLoopRetryCount) blockers.push(`review 재시도 ${chain.autoLoopRetryCount}회`);

  return {
    sessionId: session.id,
    state: session.state,
    featureName: session.featureName,
    projectPath: session.projectPath,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt,
    ...(toLocalTime(session.updatedAt) ? { updatedAtLocal: toLocalTime(session.updatedAt) } : {}),
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
/**
 * 태스크에 연결된 세션을 찾는다. `sugo_plan(prd)`이 세션에 `linkedTaskId`를 심어두므로 그걸로 건다.
 *
 * task와 session은 서로 동기화되지 않는다 — `sugo_task(update, done)`으로 태스크를 닫아도 세션은
 * 그대로고, 반대로 세션이 막혀 방치돼도 태스크는 in_progress로 남는다. 자동 동기화는 하지 않는다
 * (사람이 태스크를 닫았다고 파이프라인이 끝난 건 아니다). 대신 **두 층을 함께 보여줘** 사람이
 * 한쪽만 보고 오판하지 않게 한다.
 */
export function sessionForTask(sessions: PlanSession[], taskId: string): SessionSummary | undefined {
  const matched = sessions
    .filter((s) => s.data?.linkedTaskId === taskId)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  return matched[0] ? summarizeSession(matched[0]) : undefined;
}

export function sessionsForProjects(sessions: PlanSession[], projectPaths: string[]): SessionSummary[] {
  const paths = new Set(projectPaths);
  return sessions
    .filter((s) => paths.has(s.projectPath))
    .map(summarizeSession)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}
