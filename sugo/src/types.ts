import { ACTION_TYPES, WORKFLOW_STATES, type ActionName } from "./ontology/model.js";

/**
 * **상태·액션의 정본은 `ontology/model.ts`다(§2).** 여기 있는 것들은 전부 그 선언에서 파생된
 * 별칭이거나(PLAN_STATES/PLAN_ACTIONS/PREREQUISITES/RESULT_STATE) 손관리가 정당한 보조
 * 테이블(NEXT_ACTION_HINTS)이다. 상태나 액션을 추가·수정하려면 model.ts만 고치면 된다 —
 * 여기에 사본을 만들면 `ontology/invariants.test.ts`의 정적 스캔이 실패한다.
 */
export const PLAN_STATES = WORKFLOW_STATES;
export type PlanState = (typeof PLAN_STATES)[number];

export const PLAN_ACTIONS = ACTION_TYPES.map((a) => a.name) as readonly ActionName[];
export type PlanAction = ActionName;

/**
 * Zod `z.enum()`은 최소 1개짜리 **가변 튜플**을 요구하는데 map 결과는 배열이라 그대로는 못 넣는다.
 * 4계층 정합성 테스트(계층1)가 이 값과 온톨로지를 직접 대조하므로, 여기서 캐스팅해도 드리프트는
 * 테스트가 잡는다.
 */
export const planArgsActionEnum = PLAN_ACTIONS as unknown as [PlanAction, ...PlanAction[]];

export { PREREQUISITES, RESULT_STATE } from "./ontology/derive.js";

/**
 * 각 상태에서 다음으로 부를 수 있는 액션 **힌트**(LLM 유도용). 허용 집합이 아니라 "권장 다음 수"라
 * 손관리가 맞다 — 예컨대 PRD에서는 jira/decompose/oracle_done도 허용되지만, 기본 흐름은 ready다.
 * 다만 힌트가 **막힌 길을 가리키면** LLM이 게이트에 부딪히며 헤매므로, 모든 힌트가 그 상태에서
 * 실제 허용되는지를 `gate-consistency.test.ts`가 검증한다.
 */
export const NEXT_ACTION_HINTS: Record<PlanState, PlanAction[]> = {
  INIT: ["start"],
  SCAN: ["clarify"],
  CLARIFY: ["prd"],
  PRD: ["ready", "decompose", "jira"],
  DECOMPOSE: ["subtask_start"],
  ORCHESTRATING: ["subtask_start", "subtask_done", "integrate"],
  JIRA: ["ready"],
  READY: ["baseline_capture"],
  BASELINE: ["contract_start"],
  CONTRACT_RUNNING: ["contract_done"],
  CODE_READY: ["code_start"],
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
import type { JiraOption, SpecOracleState } from "./gates.js";

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
  /** sugo_chain 호출 감사로그(§5). test_start/review_start의 하드 게이트는 아니고 기록만 한다. */
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
  /** §7.1 start action에 전달된 사용자 지시. patch 모드에서 review_done이
   * work-result에 실어둔다(reviewSummary와는 별개 — "이번 차수에 뭘 요청했는지" 자체를 보존). */
  seed?: string;
  /** §5.0 스펙 오라클(q-spec 대조) 상태. prd가 specPath 실재를 확인하면 required=true로 켜고,
   * oracle_done이 ran=true로 기록하며, ready가 이 둘을 본다(§설계안). */
  specOracle?: SpecOracleState;
  /** 설계안 jira 연동 선택 기록. `"new"`는 실제 티켓을 만들지 않는다(스펙상 TODO). */
  jira?: { option: JiraOption; jiraKey?: string; recordedAt: string };
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
