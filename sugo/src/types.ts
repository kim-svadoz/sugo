export const PLAN_STATES = [
  "INIT",
  "SCAN",
  "CLARIFY",
  "PRD",
  "READY",
  "BASELINE",
  "CONTRACT_RUNNING",
  "CODE_READY",
  "DECOMPOSE",
  "ORCHESTRATING",
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
  "baseline_capture",
  "contract_start",
  "contract_done",
  "decompose",
  "subtask_start",
  "subtask_done",
  "integrate",
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
 * 빈 배열로 표기하고 handler에서 별도 처리한다.
 *
 * **v1 스펙 델타(게이트 하드닝,) — 코드 착수 전 선형화:** 원본은 `READY→code_start`
 * 직행이었으나, 지금은 `READY→baseline_capture→BASELINE→contract_start→CONTRACT_RUNNING
 * →contract_done→CODE_READY→code_start`로 선형화됐다. `code_start`는 정상 진입(CODE_READY) 외에
 * auto-loop 역방향 재진입(TEST_DONE, REVIEW_RUNNING)도 허용한다 — READY 직행은 이제 차단된다.
 * §10 decompose 오케스트레이션(선택 확장)은 이 선형화와 별개 분기: READY에서 baseline_capture
 * 대신 decompose로 들어가 subtask_start/subtask_done을 반복하다 integrate로 CODE_RUNNING에
 * 합류한다(BASELINE/CONTRACT_RUNNING/CODE_READY를 거치지 않음 — decompose 경로는 code_done의
 * 기존 baseline 콘텐츠게이트를 그대로 재사용해 보호된다. tools/sugoPlan.ts 주석 참고).
 */
export const PREREQUISITES: Record<PlanAction, PlanState[]> = {
  start: [],
  clarify: ["SCAN"],
  prd: ["CLARIFY"],
  ready: ["PRD"],
  baseline_capture: ["READY"],
  contract_start: ["BASELINE"],
  contract_done: ["CONTRACT_RUNNING"],
  decompose: ["READY"],
  subtask_start: ["DECOMPOSE", "ORCHESTRATING"],
  subtask_done: ["ORCHESTRATING"],
  integrate: ["ORCHESTRATING"],
  code_start: ["CODE_READY", "TEST_DONE", "REVIEW_RUNNING"],
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
  baseline_capture: "BASELINE",
  contract_start: "CONTRACT_RUNNING",
  contract_done: "CODE_READY",
  decompose: "DECOMPOSE",
  subtask_start: "ORCHESTRATING",
  subtask_done: "ORCHESTRATING",
  integrate: "CODE_RUNNING",
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
  READY: ["baseline_capture", "decompose"],
  BASELINE: ["contract_start"],
  CONTRACT_RUNNING: ["contract_done"],
  CODE_READY: ["code_start"],
  DECOMPOSE: ["subtask_start"],
  ORCHESTRATING: ["subtask_start", "subtask_done", "integrate"],
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
import type { ContractTestRecord } from "./contractEvidence.js";
import type { CoverageMap } from "./consistency.js";
import type { DecomposeManifest } from "./decompose.js";
import type { HumanHoursEstimate } from "./humanHours.js";
import type { BypassLabel } from "./labelGuard.js";
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
  /** review_done이 실제로 증거 재사용(reusedFromTestDone)으로 통과했는지 감사 기록. */
  evidenceReused?: boolean;
  /** §10 계약테스트 실행증거 — sugo_record_contract_evidence로 누적되는 red/green 기록. */
  contractTests?: ContractTestRecord[];
  /** §4.6 label-guard: 세션 동안 실제로 사용된 우회 라벨 누적(모순 검사를 통과한 것만). commit
   * 시점에 completionGrade 강등 판정의 입력이 된다. */
  bypassLabels?: BypassLabel[];
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
  /** §10 decompose 오케스트레이션(선택 확장) — DECOMPOSE/ORCHESTRATING 상태 동안의 서브태스크 매니페스트. */
  decomposeManifest?: DecomposeManifest;
  /** §7.1 Patch 성숙화: start action에 전달된 사용자 지시. patch 모드에서 review_done이
   * work-result에 실어둔다(reviewSummary와는 별개 — "이번 차수에 뭘 요청했는지" 자체를 보존). */
  seed?: string;
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
