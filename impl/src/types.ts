export const PLAN_STATES = [
  "INIT",
  "SCAN",
  "CLARIFY",
  "PRD",
  "READY",
  "CODE_RUNNING",
  "CODE_DONE",
  "TEST_RUNNING",
  "TEST_DONE",
  "REVIEW_RUNNING",
  "DOCS_PENDING",
  "COMMIT_PENDING",
  "DONE",
] as const;

export type PlanState = (typeof PLAN_STATES)[number];

export const PLAN_ACTIONS = [
  "start",
  "clarify",
  "prd",
  "ready",
  "code_start",
  "code_done",
  "test_start",
  "test_done",
  "review_start",
  "review_done",
  "docs_done",
  "commit",
  "status",
  "cancel",
] as const;

export type PlanAction = (typeof PLAN_ACTIONS)[number];

/**
 * 스펙 §3 전이·전제 표. `start`/`status`/`cancel`은 세션이 없어도(또는 임의 상태에서) 실행 가능하므로
 * 빈 배열로 표기하고 handler에서 별도 처리한다. code_start는 정상 진입(READY) 외에
 * auto-loop 역방향 재진입(TEST_DONE, REVIEW_RUNNING)도 허용한다.
 */
export const PREREQUISITES: Record<PlanAction, PlanState[]> = {
  start: [],
  clarify: ["SCAN"],
  prd: ["CLARIFY"],
  ready: ["PRD"],
  code_start: ["READY", "TEST_DONE", "REVIEW_RUNNING"],
  code_done: ["CODE_RUNNING"],
  test_start: ["CODE_DONE"],
  test_done: ["TEST_RUNNING"],
  review_start: ["TEST_DONE"],
  review_done: ["REVIEW_RUNNING"],
  docs_done: ["DOCS_PENDING"],
  commit: ["COMMIT_PENDING"],
  status: [],
  cancel: [],
};

/** action 실행이 성공했을 때의 결과 상태. status/cancel은 상태를 바꾸지 않는다(cancel은 별도 처리). */
export const RESULT_STATE: Partial<Record<PlanAction, PlanState>> = {
  start: "SCAN",
  clarify: "CLARIFY",
  prd: "PRD",
  ready: "READY",
  code_start: "CODE_RUNNING",
  code_done: "CODE_DONE",
  test_start: "TEST_RUNNING",
  test_done: "TEST_DONE",
  review_start: "REVIEW_RUNNING",
  review_done: "DOCS_PENDING",
  docs_done: "COMMIT_PENDING",
  commit: "DONE",
};

/** 각 상태에서 다음으로 부를 수 있는 액션 힌트(LLM 유도용). */
export const NEXT_ACTION_HINTS: Record<PlanState, PlanAction[]> = {
  INIT: ["start"],
  SCAN: ["clarify"],
  CLARIFY: ["prd"],
  PRD: ["ready"],
  READY: ["code_start"],
  CODE_RUNNING: ["code_done"],
  CODE_DONE: ["test_start"],
  TEST_RUNNING: ["test_done"],
  TEST_DONE: ["review_start", "code_start"],
  REVIEW_RUNNING: ["review_done", "code_start"],
  DOCS_PENDING: ["docs_done"],
  COMMIT_PENDING: ["commit"],
  DONE: [],
};

import type { ChainDirection } from "./chain.js";
import type { CoverageMap } from "./consistency.js";
import type { HumanHoursEstimate } from "./humanHours.js";
import type { PatchContext } from "./patch.js";
import type { TestEvidenceRecord, TestPassedState } from "./testEvidence.js";

/** code_done 시점에 전달된 게이트 관련 플래그를 감사(audit) 목적으로 보존한다 — 자기보고 값이지만
 * 최소한 "무엇을 주장했는지"는 세션 파일에 남겨 나중에 review 단계에서 대조할 수 있게 한다. */
export interface CodeGateAudit {
  wiringTestAdded?: boolean;
  dependencyRemoved?: boolean;
  registrationGlueChecked?: boolean;
  bootAnnotationFound?: boolean;
  bootUnverifiedReason?: string;
}

export interface ChainInfo {
  changedFiles: string[];
  analyzeAttempts: number;
  analyzePassed: boolean | null;
  analyzeLastVerdict?: "pass" | "partial" | "fail";
  testEvidence?: TestEvidenceRecord;
  testPassedState: TestPassedState | null;
  testEvidenceFingerprint?: string;
  reviewPassed: boolean | null;
  workResultPath?: string;
  autoLoopRetryCount: number;
  codeGateAudit?: CodeGateAudit;
  /** sugo_chain 호출 감사로그(§5). 이번 빌드에서는 test_start/review_start의 하드 게이트는
   * 아니고 기록만 한다 — roadmap-progress.md의 4단계 스코프 결정 참고. */
  chainHandoffs?: { direction: ChainDirection; calledAt: string }[];
  lastValidation?: { verdict: "pass" | "partial" | "fail"; checkedAt: string; fabricatedCount: number };
  /** review_done에서 계산한 값을 commit 시점(§8 WorkLog 기록)까지 들고 가기 위한 보존 필드. */
  humanHoursEstimate?: HumanHoursEstimate;
  reviewSummary?: string;
  /** §4.5 판단품질 측정용 타임스탬프 — review_done 완료 시각(완료선언→실동작 갭 계산에 사용). */
  reviewDoneAt?: string;
  /** review_done의 runtimeCheck.unverifiedReason이 실제로 제출됐으면 보존(§4.5 environmentAbsentRate). */
  runtimeCheckUnverifiedReason?: string;
  /** §10 PRD 정합성 게이트(선택 확장) — test_done에 제출된 커버리지맵을 감사 목적으로 보존. */
  coverageMap?: CoverageMap;
}

export interface SessionData {
  featurePath?: string;
  prdPath?: string;
  mode: "plan" | "patch";
  patch?: PatchContext;
  baselineGate?: { required: boolean; signals: string[]; evidence?: TestEvidenceRecord };
  chainInfo: ChainInfo;
  commitContext?: unknown;
  docsContext?: unknown;
  /** §8 HULK 연동: prd 성공 시 프로젝트가 워크스페이스에 속해 있으면 자동 생성된 Task를 가리킨다. */
  hulkWorkspace?: string;
  hulkTaskId?: string;
}

export interface PlanSession {
  id: string;
  state: PlanState;
  projectPath: string;
  featureName: string;
  startedAt: string;
  updatedAt: string;
  cancelledAt?: string;
  data: SessionData;
}

export function createEmptySessionData(): SessionData {
  return {
    mode: "plan",
    chainInfo: {
      changedFiles: [],
      analyzeAttempts: 0,
      analyzePassed: null,
      testPassedState: null,
      reviewPassed: null,
      autoLoopRetryCount: 0,
    },
  };
}
