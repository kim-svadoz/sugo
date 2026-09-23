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
  /** 화면·문서에 노출되는 이름. 내부 name과 다를 수 있다(workstream = "Run"). */
  label: string;
  meaning: string;
  /** 계층 부모의 name. 최상위는 null. */
  containedBy: string | null;
}

export const OBJECT_TYPES = [
  { name: "spec", label: "Spec", meaning: "마스터 PRD(경로=소속). 로드맵 최상위 컨테이너", containedBy: null },
  { name: "workstream", label: "Run", meaning: "feat/patch 실행 단위. Spec 안에 시간순 적층", containedBy: "spec" },
  { name: "task", label: "Task", meaning: "레포별 실제 산출물. 진행률 기준 층", containedBy: "workstream" },
  { name: "subtask", label: "REQ", meaning: "Task 하위 세부 검증 스펙(요구사항)", containedBy: "task" },
  { name: "step", label: "Step(레거시)", meaning: "구 단계 단위. 신규 흐름 미사용", containedBy: "subtask" },
] as const satisfies readonly ObjectType[];

// ── 2.2 LINK_TYPES ───────────────────────────────────────────────────────────

export interface LinkType {
  name: string;
  from: string;
  to: string;
  meaning: string;
}

export const LINK_TYPES = [
  { name: "contains", from: "*", to: "*", meaning: "계층 포함(parent). spec→workstream→task→subtask" },
  { name: "depends_on", from: "task", to: "task", meaning: "형제 순서/의존(DAG). to가 먼저 done이어야 from ready" },
  { name: "lineage", from: "task", to: "task", meaning: "patch 계보(원본 아래 차수 체인). task 노드에만" },
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
  /**
   * **서술용 대표 게이트 라벨이지 실제 차단 지점이 아니다(§5.0 주의).** 예를 들어
   * `oracle_done`에 붙은 `SPEC_ORACLE_NOT_RUN`의 실제 차단은 `ready`에서 일어나고,
   * `baseline_capture`의 `BASELINE_*`는 pre-code 진입에서 걸린다. 실제 차단 매핑은 §5 게이트 표.
   */
  gates: readonly string[];
}

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
  { name: "start", fromStates: null, toState: "SCAN", gates: [] },
  { name: "clarify", fromStates: ["SCAN"], toState: "CLARIFY", gates: ["SPEC_DRAFT_SELECTION_REQUIRED"] },
  { name: "prd", fromStates: ["CLARIFY"], toState: "PRD", gates: ["CONFORMANCE_LEDGER"] },
  { name: "oracle_done", fromStates: ["PRD", "JIRA"], toState: null, gates: ["SPEC_ORACLE_NOT_RUN"] },
  { name: "decompose", fromStates: ["PRD"], toState: "DECOMPOSE", gates: [] },
  { name: "subtask_start", fromStates: ["DECOMPOSE", "ORCHESTRATING"], toState: "ORCHESTRATING", gates: [] },
  { name: "subtask_done", fromStates: ["ORCHESTRATING"], toState: "ORCHESTRATING", gates: [] },
  { name: "integrate", fromStates: ["ORCHESTRATING"], toState: "DOCS_PENDING", gates: [] },
  { name: "jira", fromStates: ["PRD"], toState: "JIRA", gates: [] },
  { name: "ready", fromStates: ["JIRA", "PRD"], toState: "READY", gates: [] },
  { name: "baseline_capture", fromStates: ["READY"], toState: "BASELINE", gates: ["BASELINE_RED", "BASELINE_NOT_RUN"] },
  { name: "contract_start", fromStates: ["BASELINE"], toState: "CONTRACT_RUNNING", gates: [] },
  { name: "contract_done", fromStates: ["CONTRACT_RUNNING"], toState: "CODE_READY", gates: ["CONTRACT_NOT_AUTHORED"] },
  { name: "code_start", fromStates: ["CODE_READY", "REVIEW_RUNNING", "TEST_DONE"], toState: "CODE_RUNNING", gates: [] },
  {
    name: "code_done",
    fromStates: ["CODE_RUNNING"],
    toState: "CODE_DONE",
    gates: ["ANALYZE_NOT_CALLED", "WIRING_GATE_NOT_SATISFIED", "BOOT_GATE_NOT_SATISFIED"],
  },
  { name: "test_start", fromStates: ["CODE_DONE"], toState: "TEST_RUNNING", gates: [] },
  { name: "test_done", fromStates: ["TEST_RUNNING"], toState: "TEST_DONE", gates: ["TEST_EVIDENCE_MISMATCH"] },
  /**
   * §4.3-R 증거 재스냅샷. `test_done`이 찍은 `testPassedState`/지문은 그 시점 값으로 고정돼,
   * 이후 올바른 증거를 다시 기록해도 `review_done`이 옛 판정을 보고 막는 데드락이 있었다
   * (forward-only라 `test_done`으로 되돌아갈 수도 없다). 상태는 그대로 두고 스냅샷만 다시 찍는다.
   * 게이트를 무르게 하는 게 아니라 `evidenceResnapshot` 라벨로 남겨 완료등급을 강등시킨다.
   */
  { name: "test_reverify", fromStates: ["TEST_DONE", "REVIEW_RUNNING"], toState: null, gates: [] },
  { name: "review_start", fromStates: ["TEST_DONE"], toState: "REVIEW_RUNNING", gates: [] },
  {
    name: "review_done",
    fromStates: ["REVIEW_RUNNING"],
    toState: "DOCS_PENDING",
    gates: ["PRD_COVERAGE_GATE_FAILED", "RUNTIME_UNVERIFIED_GATE_FAILED"],
  },
  { name: "docs_done", fromStates: ["DOCS_PENDING"], toState: "COMMIT_PENDING", gates: [] },
  // §4.3-T: feature/* 브랜치면 TODO-SPEC.md가 세션 시작 이후 갱신됐는지 확인한다(무조건 —
  // opt-in 아님). 다른 §10 확장 게이트와 달리 브랜치 패턴 자체가 스위치다.
  { name: "commit", fromStates: ["COMMIT_PENDING"], toState: "DONE", gates: ["TODO_SPEC_SYNC_REQUIRED"] },
  { name: "status", fromStates: null, toState: null, gates: [] },
  { name: "cancel", fromStates: null, toState: null, gates: [] },
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
}

export const INVARIANTS = [
  {
    id: "user-final-confirm",
    enforcedBy: "gate",
    statement: "AI는 스스로 완료 못 함 — 사람의 review_done(REQ-CONFIRM)이 유일 최종 게이트",
  },
  {
    id: "async-asymmetry",
    enforcedBy: "doc",
    statement: "플러그인→대시보드 push(fire-and-forget), pull은 플러그인이. 대시보드는 플러그인을 못 부른다",
  },
  {
    id: "no-silent-loss",
    enforcedBy: "test",
    statement: "아웃바운드 sync 실패는 침묵 유실 금지 — 재시도 큐(WAL) 또는 명시 degrade+로그",
  },
  {
    id: "single-source",
    enforcedBy: "test",
    statement: "판별·파싱·필드·버전은 단일 소스. 복붙 금지(parseReqHeading·isUserConfirmReq·titleToSlug + 모델 drift)",
  },
  { id: "doer-wired", enforcedBy: "test", statement: "규칙은 실제 doer에게 구조화 필드로 도달해야(프로즈만 X)" },
  {
    id: "cross-repo-contract",
    enforcedBy: "test",
    statement: "sync 필드는 2레포 계약. schemaVersion 싣고 양방향 graceful degrade(500 금지)",
  },
  {
    id: "ownership-preserved",
    enforcedBy: "test",
    statement: "플러그인 sync는 대시보드 정본 컬럼(manual_status·pos)을 덮지 않는다",
  },
  { id: "no-fetch-bypass", enforcedBy: "test", statement: "아웃바운드는 재시도 큐를 거친다 — void fetch 바이패스 금지" },
  { id: "user-truth", enforcedBy: "doc", statement: "사용자가 보는 상태 = 실제 상태. 괴리는 곧 버그" },
  { id: "gate-not-skippable", enforcedBy: "gate", statement: "워크플로우 순서는 서버가 강제(PREREQUISITES)" },
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
} as const;

export type OntologyView = keyof typeof ONTOLOGY;
