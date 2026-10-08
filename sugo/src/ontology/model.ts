/**
 * §2 오퍼레이셔널 온톨로지 — **선언(데이터)이며 런타임 로직이 없다.**
 *
 * 상태·액션·전제·소유권·불변식·경계의 정본(SOT)이고, 코드/게이트/문서/MCP 주입이 전부 여기서
 * 파생·검증된다. 팔란티어 파운드리의 "오퍼레이셔널 온톨로지"(객체·링크·액션을 데이터가 아니라
 * **거버넌스**로 다루는 모델)에서 착안 — 여기선 워크플로우 자체를 온톨로지로 모델링해 순서·완료·
 * 소유권을 기계가 강제한다.
 *
 * **왜 파일 하나로 몰았나(§2.8):** `PREREQUISITES`(전제)와 상태별 허용목록을 따로 손관리하면,
 * 액션을 하나 추가할 때 한 군데를 빠뜨려도 타입은 통과하고 런타임에 "게이트는 요구하는데
 * 허용목록엔 없어" 형태의 **데드락**으로만 드러난다. 둘 다 `ACTION_TYPES` 하나에서 파생하면
 * divergence가 구조적으로 불가능하고, `ontology/gate-consistency.test.ts`가 4계층 일치를 잠근다.
 *
 * 이 파일에 함수를 넣지 말 것 — 파생은 `derive.ts`, 검증은 테스트의 몫이다.
 */

// ── 2.1 OBJECT_TYPES ─────────────────────────────────────────────────────────

/** 로드맵 노드 공통 상태. `RoadmapNodeStatus`와 컴파일타임 잠금(model.test.ts). */
export const ALL_STATUSES = ["pending", "in_progress", "done", "blocked", "dropped"] as const;
export type OntologyStatus = (typeof ALL_STATUSES)[number];

export interface ObjectType {
  name: string;
  /** roadmap은 Canvas 계층, runtime은 실행 중 생성·소비되는 운영 객체다. */
  layer: "roadmap" | "runtime";
  /** 화면·문서에 노출되는 이름. 내부 name과 다를 수 있다(workstream = "Run"). */
  label: string;
  meaning: string;
  /** roadmap 계층 부모의 name. runtime 객체는 관계(LinkType)로 연결하므로 null. */
  containedBy: string | null;
  /** 선언이 장식으로 남지 않도록 실제 런타임 타입에 연결한다. */
  implementationRefs: readonly ImplementationReference[];
}

export interface ImplementationReference {
  /** `sugo/` 패키지 루트 기준 상대 경로. */
  path: string;
  /** 해당 파일에 실제 존재해야 하는 타입·인터페이스 이름. */
  symbol: string;
}

export const OBJECT_TYPES = [
  { name: "spec", layer: "roadmap", label: "Spec", meaning: "마스터 PRD(경로=소속). 로드맵 최상위 컨테이너", containedBy: null, implementationRefs: [{ path: "src/hulk/types.ts", symbol: "RoadmapNode" }] },
  { name: "workstream", layer: "roadmap", label: "Run", meaning: "feat/patch 실행 단위. Spec 안에 시간순 적층", containedBy: "spec", implementationRefs: [{ path: "src/hulk/types.ts", symbol: "RoadmapNode" }] },
  { name: "task", layer: "roadmap", label: "Task", meaning: "레포별 실제 산출물. 진행률 기준 층", containedBy: "workstream", implementationRefs: [{ path: "src/hulk/types.ts", symbol: "RoadmapNode" }, { path: "src/hulk/types.ts", symbol: "interface Task" }] },
  { name: "subtask", layer: "roadmap", label: "REQ", meaning: "Task 하위 세부 검증 스펙(요구사항)", containedBy: "task", implementationRefs: [{ path: "src/hulk/types.ts", symbol: "RoadmapNode" }] },
  { name: "step", layer: "roadmap", label: "Step(레거시)", meaning: "구 단계 단위. 신규 흐름 미사용", containedBy: "subtask", implementationRefs: [{ path: "src/hulk/types.ts", symbol: "RoadmapNode" }] },
  { name: "session", layer: "runtime", label: "Session", meaning: "한 feat/patch 상태머신 실행과 그 감사 상태", containedBy: null, implementationRefs: [{ path: "src/types.ts", symbol: "interface PlanSession" }] },
  { name: "evidence", layer: "runtime", label: "Evidence", meaning: "게이트가 소비하는 baseline·contract·test·runtime·validation 실행 증거", containedBy: null, implementationRefs: [{ path: "src/testEvidence.ts", symbol: "interface TestEvidenceRecord" }, { path: "src/contractEvidence.ts", symbol: "interface ContractTestRecord" }] },
  { name: "human_decision", layer: "runtime", label: "Human Decision", meaning: "질문·선택지·답변·복귀 action을 보존하는 사람 판단", containedBy: null, implementationRefs: [{ path: "src/hulk/types.ts", symbol: "interface HumanBlocker" }] },
  { name: "artifact", layer: "runtime", label: "Artifact", meaning: "PRD·TODO-SPEC·work-result·commit/PR처럼 실행이 생산한 추적 가능 산출물", containedBy: null, implementationRefs: [{ path: "src/workResultReport.ts", symbol: "interface WorkResultReport" }] },
] as const satisfies readonly ObjectType[];

// ── 2.2 LINK_TYPES ───────────────────────────────────────────────────────────

export interface LinkType {
  name: string;
  from: string | readonly string[];
  to: string | readonly string[];
  meaning: string;
  implementationRefs: readonly ImplementationReference[];
}

export const LINK_TYPES = [
  { name: "contains", from: "*", to: "*", meaning: "계층 포함(parent). spec→workstream→task→subtask", implementationRefs: [{ path: "src/hulk/types.ts", symbol: "parent?: string" }] },
  { name: "depends_on", from: "task", to: "task", meaning: "형제 순서/의존(DAG). to가 먼저 done이어야 from ready", implementationRefs: [{ path: "src/hulk/types.ts", symbol: "dependsOn: string[]" }] },
  { name: "lineage", from: "task", to: "task", meaning: "patch 계보(원본 아래 차수 체인). task 노드에만", implementationRefs: [{ path: "src/hulk/types.ts", symbol: "lineage?: RoadmapLineageEntry[]" }] },
  { name: "operates_on", from: "session", to: "task", meaning: "상태머신 session이 구현하는 로드맵 Task", implementationRefs: [{ path: "src/types.ts", symbol: "hulkTaskId?: string" }] },
  { name: "requires", from: "action", to: "evidence", meaning: "action 게이트가 전이를 위해 요구하는 실행 증거", implementationRefs: [{ path: "src/ontology/model.ts", symbol: "evidenceSource: string" }] },
  { name: "produces", from: "action", to: ["artifact", "evidence"], meaning: "action 실행이 생성·갱신하는 산출물 또는 증거", implementationRefs: [{ path: "src/types.ts", symbol: "testEvidence?: TestEvidenceRecord" }, { path: "src/types.ts", symbol: "workResultReport?: WorkResultReport" }] },
  { name: "blocks", from: "human_decision", to: "session", meaning: "미결정 사람 판단이 session의 다음 전이를 차단", implementationRefs: [{ path: "src/types.ts", symbol: "humanDecisionGate?:" }] },
  { name: "resumes_at", from: "human_decision", to: "action", meaning: "판단 반영 후 같은 session에서 재개할 action", implementationRefs: [{ path: "src/hulk/types.ts", symbol: "resumeAction: string" }] },
  { name: "derived_from", from: "task", to: "task", meaning: "patch Task가 근거로 삼은 이전 완료 Task", implementationRefs: [{ path: "src/hulk/types.ts", symbol: "parentTaskId: string" }] },
] as const satisfies readonly LinkType[];

// ── 2.3 WORKFLOW_STATES ──────────────────────────────────────────────────────

/** §2.3 순서대로 19개. 이 배열이 `PLAN_STATES`의 정본이다. */
export const WORKFLOW_STATES = [
  "INIT",
  "SCAN",
  "CLARIFY",
  "PRD",
  "DECOMPOSE",
  "ORCHESTRATING",
  "JIRA",
  "READY",
  "BASELINE",
  "CONTRACT_RUNNING",
  "CODE_READY",
  "CODE_RUNNING",
  "CODE_DONE",
  "TEST_RUNNING",
  "TEST_DONE",
  "REVIEW_RUNNING",
  "DOCS_PENDING",
  "COMMIT_PENDING",
  "DONE",
] as const;
export type WorkflowState = (typeof WORKFLOW_STATES)[number];

// ── 2.4 ACTION_TYPES ─────────────────────────────────────────────────────────

export interface ActionType {
  name: string;
  /** 진입 허용 상태. `null` = 전제 없음(세션 유무와 무관하게 호출 가능). */
  fromStates: readonly WorkflowState[] | null;
  /** 성공 시 전이할 상태. `null` = 상태를 바꾸지 않는 기록성 액션. */
  toState: WorkflowState | null;
  /** 실제 이 액션 호출을 차단하는 게이트. 설명용 대표 라벨이 아니라 런타임 위치와 일치한다. */
  gates: readonly ActionGate[];
}

export type GateEnforcement = "hard" | "hard-with-explicit-bypass";

export interface ActionGate {
  /** 런타임 errorCode와 동일한 안정 식별자. */
  gateId: string;
  /** 게이트를 실제 평가하는 sugo_plan action. */
  checkedOnAction: string;
  /** 서버가 판정에 사용하는 입력·저장 증거·실측값. */
  evidenceSource: string;
  /** hard는 충족 전 진행 불가, hard-with-explicit-bypass는 사유 라벨로만 우회 가능. */
  enforcement: GateEnforcement;
}

/**
 * 액션별 콘텐츠 게이트 정본. 순서 전제(`fromStates`)와 별개로 payload·증거·실측을 검사한다.
 * `checkedOnAction`을 명시적으로 반복하는 이유는 MCP 소비자가 배열이 분리돼도 실제 차단 위치를
 * 잃지 않게 하기 위해서다. ID는 `gates.ts` 및 보조 gate 모듈이 반환하는 errorCode와 같아야 한다.
 */
export const ACTION_GATES = {
  start: [],
  clarify: [
    { gateId: "TODO_SPEC_DRAFT_INCOMPLETE", checkedOnAction: "clarify", evidenceSource: "args.todoSpecGoal + args.todoSpecItems", enforcement: "hard" },
    { gateId: "TODO_SPEC_DRAFT_CONFIRMATION_REQUIRED", checkedOnAction: "clarify", evidenceSource: "args.todoSpecUserConfirmed", enforcement: "hard" },
    { gateId: "SPEC_DRAFT_SELECTION_REQUIRED", checkedOnAction: "clarify", evidenceSource: "session.specDraftSelection + args.specDraftDecision", enforcement: "hard" },
    { gateId: "SPEC_DRAFT_ID_REQUIRED", checkedOnAction: "clarify", evidenceSource: "args.specDraftDecision + args.specDraftId", enforcement: "hard" },
    { gateId: "SPEC_DRAFT_NOT_FOUND", checkedOnAction: "clarify", evidenceSource: "session.specDraftSelection.candidates", enforcement: "hard" },
  ],
  prd: [
    { gateId: "CONFORMANCE_LEDGER_INCOMPLETE", checkedOnAction: "prd", evidenceSource: "args.prdContent In-Scope/DoD ↔ declared REQ", enforcement: "hard" },
    { gateId: "PRD_TOO_SHORT", checkedOnAction: "prd", evidenceSource: "args.prdContent.length", enforcement: "hard" },
    { gateId: "PRD_MISSING_REQUIREMENTS", checkedOnAction: "prd", evidenceSource: "args.prdContent REQ-* count", enforcement: "hard" },
  ],
  oracle_done: [
    { gateId: "ORACLE_OVERRIDE_REASON_REQUIRED", checkedOnAction: "oracle_done", evidenceSource: "args.uncovered + args.overrideReason", enforcement: "hard-with-explicit-bypass" },
  ],
  decompose: [
    { gateId: "MANIFEST_HAS_CYCLE", checkedOnAction: "decompose", evidenceSource: "args.manifest.subtasks[].dependsOn", enforcement: "hard" },
    { gateId: "MANIFEST_FILE_OVERLAP", checkedOnAction: "decompose", evidenceSource: "args.manifest.subtasks[].files", enforcement: "hard" },
    { gateId: "MANIFEST_REQUIREMENT_UNCOVERED", checkedOnAction: "decompose", evidenceSource: "PRD REQ-* ↔ args.manifest.subtasks[].coversRequirements", enforcement: "hard" },
  ],
  subtask_start: [
    { gateId: "SUBTASK_NOT_FOUND", checkedOnAction: "subtask_start", evidenceSource: "session.decomposeManifest + args.subtaskId", enforcement: "hard" },
  ],
  subtask_done: [
    { gateId: "SUBTASK_NOT_FOUND", checkedOnAction: "subtask_done", evidenceSource: "session.decomposeManifest + args.subtaskId", enforcement: "hard" },
  ],
  integrate: [
    { gateId: "SUBTASKS_INCOMPLETE", checkedOnAction: "integrate", evidenceSource: "session.decomposeManifest.subtasks[].status", enforcement: "hard" },
    { gateId: "MANIFEST_FILE_OVERLAP", checkedOnAction: "integrate", evidenceSource: "session.decomposeManifest.subtasks[].changedFiles", enforcement: "hard" },
    { gateId: "ANALYZE_NOT_CALLED", checkedOnAction: "integrate", evidenceSource: "session.chainInfo.analyzeAttempts", enforcement: "hard" },
    { gateId: "BASELINE_NOT_GREEN", checkedOnAction: "integrate", evidenceSource: "session.baselineGate.required + evidence.exitCode", enforcement: "hard" },
    { gateId: "WIRING_TEST_MISSING", checkedOnAction: "integrate", evidenceSource: "merged changedFiles + args.wiringTestAdded", enforcement: "hard" },
    { gateId: "BOOT_GATE_FAILED", checkedOnAction: "integrate", evidenceSource: "server project scan + args.bootUnverifiedReason", enforcement: "hard-with-explicit-bypass" },
  ],
  jira: [
    { gateId: "JIRA_OPTION_REQUIRED", checkedOnAction: "jira", evidenceSource: "args.jiraOption", enforcement: "hard" },
    { gateId: "JIRA_KEY_REQUIRED", checkedOnAction: "jira", evidenceSource: "args.jiraOption + args.jiraKey", enforcement: "hard" },
  ],
  ready: [
    { gateId: "SPEC_ORACLE_NOT_RUN", checkedOnAction: "ready", evidenceSource: "session.specOracle.required + ran", enforcement: "hard" },
  ],
  baseline_capture: [
    { gateId: "BASELINE_NOT_GREEN", checkedOnAction: "baseline_capture", evidenceSource: "session.baselineGate.required + evidence.exitCode", enforcement: "hard" },
  ],
  contract_start: [],
  contract_done: [
    { gateId: "CONTRACT_NOT_STARTED", checkedOnAction: "contract_done", evidenceSource: "session.chainInfo.contractTests red exitCode", enforcement: "hard-with-explicit-bypass" },
    { gateId: "LABEL_CONTRADICTION", checkedOnAction: "contract_done", evidenceSource: "environmentAbsentReason ↔ recorded green evidence", enforcement: "hard" },
  ],
  code_start: [],
  code_done: [
    { gateId: "ANALYZE_NOT_CALLED", checkedOnAction: "code_done", evidenceSource: "session.chainInfo.analyzeAttempts", enforcement: "hard" },
    { gateId: "BASELINE_NOT_GREEN", checkedOnAction: "code_done", evidenceSource: "session.baselineGate.required + evidence.exitCode", enforcement: "hard" },
    { gateId: "WIRING_TEST_MISSING", checkedOnAction: "code_done", evidenceSource: "args.changedFiles + mode + args.wiringTestAdded", enforcement: "hard" },
    { gateId: "REGISTRATION_GLUE_NOT_CHECKED", checkedOnAction: "code_done", evidenceSource: "args.dependencyRemoved + args.registrationGlueChecked", enforcement: "hard" },
    { gateId: "BOOT_GATE_FAILED", checkedOnAction: "code_done", evidenceSource: "server project scan + args.bootUnverifiedReason", enforcement: "hard-with-explicit-bypass" },
    { gateId: "LABEL_CONTRADICTION", checkedOnAction: "code_done", evidenceSource: "bootUnverifiedReason ↔ recorded green evidence", enforcement: "hard" },
  ],
  test_start: [],
  test_done: [
    { gateId: "TEST_EVIDENCE_MISSING", checkedOnAction: "test_done", evidenceSource: "session.chainInfo.testEvidence", enforcement: "hard" },
    { gateId: "TEST_EVIDENCE_MISMATCH", checkedOnAction: "test_done", evidenceSource: "args.testPassed ↔ recorded evidence.derivedState", enforcement: "hard" },
    { gateId: "TEST_NOT_FULL_VERIFY", checkedOnAction: "test_done", evidenceSource: "recorded evidence.command", enforcement: "hard" },
    { gateId: "LABEL_CONTRADICTION", checkedOnAction: "test_done", evidenceSource: "unverified evidence ↔ other recorded green evidence", enforcement: "hard" },
    { gateId: "COVERAGE_MAP_REQUIRED", checkedOnAction: "test_done", evidenceSource: "project verificationPolicy + args.coverageMap", enforcement: "hard" },
    { gateId: "PRD_COVERAGE_INCOMPLETE", checkedOnAction: "test_done", evidenceSource: "args.coverageMap.acceptanceCriteria", enforcement: "hard" },
    { gateId: "REGRESSION_NOT_INTACT", checkedOnAction: "test_done", evidenceSource: "args.coverageMap.regressionIntact", enforcement: "hard" },
    { gateId: "INTEGRATION_TEST_MISSING", checkedOnAction: "test_done", evidenceSource: "args.coverageMap.integrationTestIncluded", enforcement: "hard" },
  ],
  test_reverify: [
    { gateId: "REVERIFY_NO_EVIDENCE", checkedOnAction: "test_reverify", evidenceSource: "session.chainInfo.testEvidence", enforcement: "hard" },
    { gateId: "REVERIFY_EVIDENCE_STILL_FAIL", checkedOnAction: "test_reverify", evidenceSource: "session.chainInfo.testEvidence.derivedState", enforcement: "hard" },
    { gateId: "REVERIFY_REASON_REQUIRED", checkedOnAction: "test_reverify", evidenceSource: "args.reverifyReason", enforcement: "hard" },
  ],
  review_start: [],
  review_done: [
    { gateId: "VALIDATE_NOT_CALLED", checkedOnAction: "review_done", evidenceSource: "session.chainInfo.lastValidation", enforcement: "hard" },
    { gateId: "VALIDATE_VERIFIED_FAILURE", checkedOnAction: "review_done", evidenceSource: "lastValidation.verifiedFailures", enforcement: "hard" },
    { gateId: "LETHAL_TRIFECTA_NOT_CALLED", checkedOnAction: "review_done", evidenceSource: "session.chainInfo.lastLethalTrifectaCheck", enforcement: "hard" },
    { gateId: "LETHAL_TRIFECTA_MITIGATION_REQUIRED", checkedOnAction: "review_done", evidenceSource: "trifecta warnings + args.trifectaMitigation", enforcement: "hard" },
    { gateId: "USER_CONFIRMATION_REQUIRED", checkedOnAction: "review_done", evidenceSource: "args.userConfirmed", enforcement: "hard" },
    { gateId: "SUMMARY_TOO_FEW_LINES", checkedOnAction: "review_done", evidenceSource: "args.summary non-empty line count", enforcement: "hard" },
    { gateId: "SUMMARY_TOO_SHORT", checkedOnAction: "review_done", evidenceSource: "args.summary length", enforcement: "hard" },
    { gateId: "SUMMARY_LOW_CHAR_DIVERSITY", checkedOnAction: "review_done", evidenceSource: "args.summary unique characters", enforcement: "hard" },
    { gateId: "SUMMARY_LOW_TOKEN_DIVERSITY", checkedOnAction: "review_done", evidenceSource: "args.summary distinct tokens", enforcement: "hard" },
    { gateId: "EVIDENCE_REUSE_NO_BASELINE", checkedOnAction: "review_done", evidenceSource: "session.testEvidenceFingerprint", enforcement: "hard" },
    { gateId: "EVIDENCE_REUSE_NOT_GREEN", checkedOnAction: "review_done", evidenceSource: "session.chainInfo.testPassedState", enforcement: "hard" },
    { gateId: "EVIDENCE_REUSE_FINGERPRINT_MISMATCH", checkedOnAction: "review_done", evidenceSource: "recorded ↔ current changedFiles fingerprint", enforcement: "hard" },
    { gateId: "RUNTIME_UNVERIFIED_GATE_FAILED", checkedOnAction: "review_done", evidenceSource: "args.runtimeCheck.runtimeVerified + unverifiedReason", enforcement: "hard-with-explicit-bypass" },
    { gateId: "RUNTIME_CLAIM_CONTRADICTS_EVIDENCE", checkedOnAction: "review_done", evidenceSource: "runtime claim ↔ session.testPassedState", enforcement: "hard" },
    { gateId: "RUNTIME_WIRING_NOT_VERIFIED", checkedOnAction: "review_done", evidenceSource: "server bootable scan + args.runtimeCheck.wiringVerified", enforcement: "hard-with-explicit-bypass" },
    { gateId: "LABEL_CONTRADICTION", checkedOnAction: "review_done", evidenceSource: "runtime unverified label ↔ recorded green evidence", enforcement: "hard" },
    { gateId: "CONTRACT_EVIDENCE_MISSING", checkedOnAction: "review_done", evidenceSource: "session.chainInfo.contractTests", enforcement: "hard" },
    { gateId: "CONTRACT_EVIDENCE_INCOMPLETE", checkedOnAction: "review_done", evidenceSource: "contract red→green exitCode pairs", enforcement: "hard" },
  ],
  docs_done: [],
  commit: [
    { gateId: "TODO_SPEC_MISSING_AT_COMMIT", checkedOnAction: "commit", evidenceSource: "feature branch TODO-SPEC file", enforcement: "hard-with-explicit-bypass" },
    { gateId: "TODO_SPEC_SYNC_REQUIRED", checkedOnAction: "commit", evidenceSource: "TODO-SPEC start snapshot ↔ commit content", enforcement: "hard-with-explicit-bypass" },
  ],
  status: [],
  cancel: [],
} as const satisfies Record<string, readonly ActionGate[]>;

/**
 * §2.4 거버넌스 전이 정본 23개. `fromStates`가 `PREREQUISITES`의 유일 원천이고,
 * 상태별 허용 액션도 여기서 역인덱싱으로 파생된다(§2.8).
 *
 * **데드락을 막는 전이 2건 — 지우지 말 것:**
 * - `oracle_done`: fromStates `[PRD, JIRA]` + `toState: null`. jira 전후 어디서 스펙 오라클을
 *   기록해도 `ready`가 열린다. 한쪽만 허용하면 "ready는 오라클을 요구하는데 그 상태에선
 *   oracle_done을 못 부르는" 데드락이 된다.
 * - `code_start`: fromStates에 정방향(CODE_READY) + auto-loop 역방향 2개(REVIEW_RUNNING,
 *   TEST_DONE). 리뷰/테스트에서 되돌아와 다시 구현에 들어가는 경로가 실제로 존재한다.
 */
export const ACTION_TYPES = [
  { name: "start", fromStates: null, toState: "SCAN", gates: ACTION_GATES.start },
  { name: "clarify", fromStates: ["SCAN"], toState: "CLARIFY", gates: ACTION_GATES.clarify },
  { name: "prd", fromStates: ["CLARIFY"], toState: "PRD", gates: ACTION_GATES.prd },
  { name: "oracle_done", fromStates: ["PRD", "JIRA"], toState: null, gates: ACTION_GATES.oracle_done },
  { name: "decompose", fromStates: ["PRD"], toState: "DECOMPOSE", gates: ACTION_GATES.decompose },
  { name: "subtask_start", fromStates: ["DECOMPOSE", "ORCHESTRATING"], toState: "ORCHESTRATING", gates: ACTION_GATES.subtask_start },
  { name: "subtask_done", fromStates: ["ORCHESTRATING"], toState: "ORCHESTRATING", gates: ACTION_GATES.subtask_done },
  { name: "integrate", fromStates: ["ORCHESTRATING"], toState: "DOCS_PENDING", gates: ACTION_GATES.integrate },
  { name: "jira", fromStates: ["PRD"], toState: "JIRA", gates: ACTION_GATES.jira },
  { name: "ready", fromStates: ["JIRA", "PRD"], toState: "READY", gates: ACTION_GATES.ready },
  { name: "baseline_capture", fromStates: ["READY"], toState: "BASELINE", gates: ACTION_GATES.baseline_capture },
  { name: "contract_start", fromStates: ["BASELINE"], toState: "CONTRACT_RUNNING", gates: ACTION_GATES.contract_start },
  { name: "contract_done", fromStates: ["CONTRACT_RUNNING"], toState: "CODE_READY", gates: ACTION_GATES.contract_done },
  { name: "code_start", fromStates: ["CODE_READY", "REVIEW_RUNNING", "TEST_DONE"], toState: "CODE_RUNNING", gates: ACTION_GATES.code_start },
  {
    name: "code_done",
    fromStates: ["CODE_RUNNING"],
    toState: "CODE_DONE",
    gates: ACTION_GATES.code_done,
  },
  { name: "test_start", fromStates: ["CODE_DONE"], toState: "TEST_RUNNING", gates: ACTION_GATES.test_start },
  { name: "test_done", fromStates: ["TEST_RUNNING"], toState: "TEST_DONE", gates: ACTION_GATES.test_done },
  /**
   * §4.3-R 증거 재스냅샷. `test_done`이 찍은 `testPassedState`/지문은 그 시점 값으로 고정돼,
   * 이후 올바른 증거를 다시 기록해도 `review_done`이 옛 판정을 보고 막는 데드락이 있었다
   * (forward-only라 `test_done`으로 되돌아갈 수도 없다). 상태는 그대로 두고 스냅샷만 다시 찍는다.
   * 게이트를 무르게 하는 게 아니라 `evidenceResnapshot` 라벨로 남겨 완료등급을 강등시킨다.
   */
  { name: "test_reverify", fromStates: ["TEST_DONE", "REVIEW_RUNNING"], toState: null, gates: ACTION_GATES.test_reverify },
  { name: "review_start", fromStates: ["TEST_DONE"], toState: "REVIEW_RUNNING", gates: ACTION_GATES.review_start },
  {
    name: "review_done",
    fromStates: ["REVIEW_RUNNING"],
    toState: "DOCS_PENDING",
    gates: ACTION_GATES.review_done,
  },
  { name: "docs_done", fromStates: ["DOCS_PENDING"], toState: "COMMIT_PENDING", gates: ACTION_GATES.docs_done },
  // §4.3-T: feature/* 브랜치면 TODO-SPEC.md가 세션 시작 이후 갱신됐는지 확인한다(무조건 —
  // opt-in 아님). 다른 §10 확장 게이트와 달리 브랜치 패턴 자체가 스위치다.
  { name: "commit", fromStates: ["COMMIT_PENDING"], toState: "DONE", gates: ACTION_GATES.commit },
  { name: "status", fromStates: null, toState: null, gates: ACTION_GATES.status },
  { name: "cancel", fromStates: null, toState: null, gates: ACTION_GATES.cancel },
] as const satisfies readonly ActionType[];

export type ActionName = (typeof ACTION_TYPES)[number]["name"];

// ── 보편 액션 정책 (§4 "정책 집합") ──────────────────────────────────────────

/** `start`가 허용되는 상태. 세션이 아예 없을 때(INIT 취급)와 끝난 뒤 새로 시작할 때. */
export const START_STATES = ["INIT", "DONE"] as const;

/**
 * `cancel`이 허용되는 상태. **에이전트 체인 구간(CODE_RUNNING~REVIEW_RUNNING)과 INIT/DONE은 제외** —
 * 체인 중간에 세션을 날리면 doer가 이미 파일을 건드린 상태로 고아가 된다.
 */
export const CANCELLABLE_STATES = [
  "SCAN",
  "CLARIFY",
  "PRD",
  "DECOMPOSE",
  "ORCHESTRATING",
  "JIRA",
  "READY",
  "BASELINE",
  "CONTRACT_RUNNING",
  "CODE_READY",
  "DOCS_PENDING",
  "COMMIT_PENDING",
] as const;

/**
 * §9-A 에이전트 체인 구간 — 여기서도 취소는 **되지만** 사유가 필수다.
 *
 * 런타임(`planStateMachine.ts`의 cancel 분기)은 전제 검사보다 먼저 실행돼 어느 상태에서든 취소를
 * 허용해 왔다. 선언(`CANCELLABLE_STATES`)만 보고 "체인 구간은 취소 불가"라고 읽으면 틀린다 —
 * 실제로 2026-09-22에 그렇게 잘못 판단해 사용자가 세션 파일을 손으로 지웠다(기록이 안 남았다).
 *
 * 선언을 사실에 맞추되, 체인 구간 취소는 "증거 체인을 끊고 접었다"는 뜻이므로 `cancelReason`을
 * 요구하고 `abandonedChain` 라벨로 남긴다. 막지 않고 기록한다(§4.6).
 */
export const CHAIN_ABANDON_STATES = ["CODE_RUNNING", "CODE_DONE", "TEST_RUNNING", "TEST_DONE", "REVIEW_RUNNING"] as const;

// ── 2.5 OWNERSHIP ────────────────────────────────────────────────────────────

export interface OwnershipEntry {
  concept: string;
  owner: "plugin" | "dashboard";
  note: string;
}

export const OWNERSHIP = [
  { concept: "워크플로우 상태(session)", owner: "plugin", note: "상태머신이 소유·강제" },
  { concept: "로드맵 노드 status", owner: "plugin", note: "push(upsert). 대시보드는 저장만" },
  { concept: "WORK 데이터(tasks·history·checkpoints·specs)", owner: "plugin", note: "로컬 원장이 정본" },
  { concept: "git(커밋·remote 감지·PR refs)", owner: "plugin", note: "플러그인이 수행·수집" },
  { concept: "manual_status(수동 완료 override)", owner: "dashboard", note: "플러그인 push가 덮지 않음" },
  { concept: "노드 위치(pos)·순서(depends_on)", owner: "dashboard", note: "사람이 캔버스에서 편집" },
  { concept: "체크포인트 편집", owner: "dashboard", note: "편집→플러그인이 pull" },
  { concept: "Bitbucket PAT", owner: "dashboard", note: "암호화 저장" },
] as const satisfies readonly OwnershipEntry[];

// ── 2.6 INVARIANTS ───────────────────────────────────────────────────────────

/**
 * `enforcedBy`는 **정직하게** 표기한다 — gate/test만 기계보장이고 doc은 조언일 뿐이다.
 * 지킬 수단이 없는 규칙을 gate로 적으면 "강제되고 있다"는 착각만 남는다.
 */
export interface Invariant {
  id: string;
  enforcedBy: "gate" | "test" | "doc";
  statement: string;
  enforcementRefs: readonly EnforcementReference[];
}

export interface EnforcementReference {
  kind: "gate" | "test" | "doc";
  /** `sugo/` 패키지 루트 기준 상대 경로. 저장소 공통 근거는 `../`로 명시한다. */
  path: string;
  /** 해당 파일 안에 반드시 존재해야 하는 export·테스트명·문서 anchor 문자열. */
  symbol?: string;
}

export const INVARIANTS = [
  {
    id: "user-final-confirm",
    enforcedBy: "gate",
    statement: "AI는 스스로 완료 못 함 — 사람의 review_done(REQ-CONFIRM)이 유일 최종 게이트",
    enforcementRefs: [
      { kind: "gate", path: "src/gates.ts", symbol: "USER_CONFIRMATION_REQUIRED" },
      { kind: "test", path: "test/gates.reviewDone.test.ts", symbol: "USER_CONFIRMATION_REQUIRED" },
    ],
  },
  {
    id: "async-asymmetry",
    enforcedBy: "doc",
    statement: "플러그인→대시보드 push(fire-and-forget), pull은 플러그인이. 대시보드는 플러그인을 못 부른다",
    enforcementRefs: [{ kind: "doc", path: "../spec/sugo-local-spec-v2.md", symbol: "async-asymmetry" }],
  },
  {
    id: "no-silent-loss",
    enforcedBy: "test",
    statement: "아웃바운드 sync 실패는 침묵 유실 금지 — 재시도 큐(WAL) 또는 명시 degrade+로그",
    enforcementRefs: [
      { kind: "test", path: "test/ontology.invariants.test.ts", symbol: "enqueueRetry 호출 존재" },
      { kind: "test", path: "test/dashboard.test.ts", symbol: "retryCount" },
    ],
  },
  {
    id: "single-source",
    enforcedBy: "test",
    statement: "판별·파싱·필드·버전은 단일 소스. 복붙 금지(parseReqHeading·isUserConfirmReq·titleToSlug + 모델 drift)",
    enforcementRefs: [{ kind: "test", path: "test/ontology.invariants.test.ts", symbol: "single-source" }],
  },
  {
    id: "doer-wired",
    enforcedBy: "test",
    statement: "규칙은 실제 doer에게 구조화 필드로 도달해야(프로즈만 X)",
    enforcementRefs: [{ kind: "test", path: "test/integration.chainAndContext.test.ts", symbol: "handoff.changedFiles" }],
  },
  {
    id: "cross-repo-contract",
    enforcedBy: "test",
    statement: "sync 필드는 2레포 계약. schemaVersion 싣고 양방향 graceful degrade(500 금지)",
    enforcementRefs: [
      { kind: "test", path: "test/dashboard.schemaVersion.test.ts", symbol: "모든 sync payload에 계약 버전" },
      { kind: "test", path: "../dashboard/backend/test/sync.schemaVersion.test.ts", symbol: "sync schemaVersion 미들웨어" },
    ],
  },
  {
    id: "ownership-preserved",
    enforcedBy: "test",
    statement: "플러그인 sync는 대시보드 정본 컬럼(manual_status·pos)을 덮지 않는다",
    enforcementRefs: [
      { kind: "test", path: "../dashboard/backend/test/sync.roadmap.test.ts", symbol: "manual_status/pos_x/pos_y를 덮으면 안 된다" },
    ],
  },
  {
    id: "no-fetch-bypass",
    enforcedBy: "test",
    statement: "아웃바운드는 재시도 큐를 거친다 — void fetch 바이패스 금지",
    enforcementRefs: [{ kind: "test", path: "test/ontology.invariants.test.ts", symbol: "no-fetch-bypass" }],
  },
  {
    id: "user-truth",
    enforcedBy: "doc",
    statement: "사용자가 보는 상태 = 실제 상태. 괴리는 곧 버그",
    enforcementRefs: [{ kind: "doc", path: "../spec/sugo-local-spec-v2.md", symbol: "user-truth" }],
  },
  {
    id: "gate-not-skippable",
    enforcedBy: "gate",
    statement: "워크플로우 순서는 서버가 강제(PREREQUISITES)",
    enforcementRefs: [
      { kind: "gate", path: "src/planStateMachine.ts", symbol: "checkPrerequisite" },
      { kind: "test", path: "test/planStateMachine.test.ts", symbol: "순서강제 게이트" },
    ],
  },
] as const satisfies readonly Invariant[];

export type InvariantId = (typeof INVARIANTS)[number]["id"];

// ── 2.7 BOUNDARIES ───────────────────────────────────────────────────────────

export interface Boundary {
  name: string;
  contract: string;
  invariantIds: readonly InvariantId[];
}

export const BOUNDARIES = [
  {
    name: "handoff",
    contract: "orchestrator→doer 위임(code_start data.reqs 등 구조화 필드)",
    invariantIds: ["doer-wired"],
  },
  {
    name: "sync",
    contract: "플러그인 sync payload ↔ 대시보드 read 필드(schemaVersion)",
    invariantIds: ["cross-repo-contract", "no-silent-loss", "ownership-preserved", "no-fetch-bypass"],
  },
  {
    name: "lifecycle",
    contract: "부팅·5분 주기 pull·큐 replay 생명주기",
    invariantIds: ["no-silent-loss", "no-fetch-bypass"],
  },
  {
    name: "workflow",
    contract: "상태머신 순서·완료의 정의",
    invariantIds: ["gate-not-skippable", "user-final-confirm"],
  },
] as const satisfies readonly Boundary[];

export type BoundaryName = (typeof BOUNDARIES)[number]["name"];

// ── 의도된 workflow cycle ──────────────────────────────────────────────────

export interface IntentionalWorkflowCycle {
  id: string;
  /** 순서는 WORKFLOW_STATES의 정방향을 따른다. SCC 분석 결과와 exact match한다. */
  states: readonly WorkflowState[];
  reason: string;
}

/**
 * cycle은 기본적으로 결함이다. 실제 운영상 필요한 두 루프만 이름과 이유를 붙여 허용한다.
 * 새 cycle은 이 목록을 의식적으로 갱신하지 않는 한 P4 그래프 검증을 통과할 수 없다.
 */
export const INTENTIONAL_WORKFLOW_CYCLES = [
  {
    id: "orchestration-progress",
    states: ["ORCHESTRATING"],
    reason: "여러 subtask를 차례로 시작·완료하는 동안 같은 orchestration 상태를 유지한다.",
  },
  {
    id: "agent-rework-loop",
    states: ["CODE_RUNNING", "CODE_DONE", "TEST_RUNNING", "TEST_DONE", "REVIEW_RUNNING"],
    reason: "테스트·리뷰에서 발견한 문제를 code_start로 되돌려 수정하고 다시 검증한다.",
  },
] as const satisfies readonly IntentionalWorkflowCycle[];

// ── 저장 증거 producer / consumer ──────────────────────────────────────────

export interface EvidenceFlow {
  id: string;
  /** 증거를 세션에 기록하는 실제 MCP 도구 이름. */
  producedBy: string;
  /** 기록된 증거를 실제 게이트 판정에 소비하는 action. */
  consumedBy: readonly ActionName[];
  /** 세션 저장 구조에서의 근거 필드. */
  storageRef: string;
}

/**
 * 게이트가 소비하는 영속 증거만 선언한다. payload-only 입력과 action 내부 임시 판정은 제외한다.
 * producer/consumer 어느 한쪽도 없는 항목은 장식용 지식이므로 P4 검증에서 거부한다.
 */
export const EVIDENCE_FLOWS = [
  { id: "baseline", producedBy: "sugo_record_test_evidence", consumedBy: ["baseline_capture", "code_done", "integrate"], storageRef: "SessionData.baselineGate.evidence" },
  { id: "contract-red-green", producedBy: "sugo_record_contract_evidence", consumedBy: ["contract_done", "review_done"], storageRef: "ChainInfo.contractTests" },
  { id: "analyze", producedBy: "sugo_analyze", consumedBy: ["code_done", "integrate"], storageRef: "ChainInfo.analyzeAttempts + analyzeLastVerdict" },
  { id: "test", producedBy: "sugo_record_test_evidence", consumedBy: ["test_done", "test_reverify", "review_done"], storageRef: "ChainInfo.testEvidence" },
  { id: "validation", producedBy: "sugo_validate", consumedBy: ["review_done"], storageRef: "ChainInfo.lastValidation" },
  { id: "lethal-trifecta", producedBy: "sugo_check_lethal_trifecta", consumedBy: ["review_done"], storageRef: "ChainInfo.lastLethalTrifectaCheck" },
] as const satisfies readonly EvidenceFlow[];

// ── 단일 export (§2.7 "전체 모델은 ONTOLOGY 객체로") ─────────────────────────

export const ONTOLOGY = {
  objectTypes: OBJECT_TYPES,
  allStatuses: ALL_STATUSES,
  linkTypes: LINK_TYPES,
  workflowStates: WORKFLOW_STATES,
  actionTypes: ACTION_TYPES,
  startStates: START_STATES,
  cancellableStates: CANCELLABLE_STATES,
  ownership: OWNERSHIP,
  invariants: INVARIANTS,
  boundaries: BOUNDARIES,
  intentionalWorkflowCycles: INTENTIONAL_WORKFLOW_CYCLES,
  evidenceFlows: EVIDENCE_FLOWS,
} as const;

export type OntologyView = keyof typeof ONTOLOGY;
