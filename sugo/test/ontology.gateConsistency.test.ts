import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ACTION_TYPES, WORKFLOW_STATES, type WorkflowState } from "../src/ontology/model.js";
import { ALLOWED_ACTIONS_BY_STATE, PREREQUISITES, RESULT_STATE } from "../src/ontology/derive.js";
import { NEXT_ACTION_HINTS, PLAN_ACTIONS, planArgsActionEnum } from "../src/types.js";

const SRC = join(__dirname, "..", "src");
const sugoPlanSource = readFileSync(join(SRC, "tools", "sugoPlan.ts"), "utf8");
const stateMachineSource = readFileSync(join(SRC, "planStateMachine.ts"), "utf8");

/**
 * §4 4계층 정합성 잠금. 한 액션이 실제로 실행되려면 독립된 4개 관문을 전부 통과해야 하고,
 * 넷 중 하나만 어긋나도 "한쪽은 허용, 다른쪽은 차단" 데드락이 된다. 과거 `oracle_done`(PRD/JIRA)과
 * `code_start`(REVIEW_RUNNING 역방향)가 정확히 이 방식으로 막혔다.
 *
 *   1. Zod        PlanArgsSchema.action        — 없으면 INVALID
 *   2. 게이트키퍼  ALLOWED_ACTIONS_BY_STATE     — 없으면 GATE_KEEPER_BLOCKED
 *   3. dispatch   applyTransition/핸들러 배선   — 없으면 UNKNOWN_ACTION
 *   4. 온톨로지    ACTION_TYPES → PREREQUISITES — 없으면 PREREQUISITE_FAILED
 */
describe("§4 4계층 정합성", () => {
  const ontologyNames = ACTION_TYPES.map((a) => a.name).sort();

  it("계층1(Zod) == 계층4(온톨로지): 양방향 차집합 0", () => {
    expect([...planArgsActionEnum].sort()).toEqual(ontologyNames);
  });

  it("계층2(허용목록 유니온) == 계층4(온톨로지): 양방향 차집합 0", () => {
    const union = new Set<string>();
    for (const s of WORKFLOW_STATES) for (const a of ALLOWED_ACTIONS_BY_STATE[s]) union.add(a);
    expect([...union].sort()).toEqual(ontologyNames);
  });

  it("계층1(Zod) == PLAN_ACTIONS", () => {
    expect([...planArgsActionEnum].sort()).toEqual([...PLAN_ACTIONS].sort());
  });

  it("계층3(dispatch): 모든 액션이 실행 경로에 도달한다", () => {
    // 이 구현의 dispatch는 switch가 아니라 applyTransition의 특수처리 + RESULT_STATE 일반경로 +
    // sugoPlan.ts의 액션별 분기다. "어디에도 안 나타나는 액션"이 곧 UNKNOWN_ACTION이므로,
    // 세 곳 중 하나에는 반드시 잡혀야 한다.
    const stray: string[] = [];
    for (const a of ACTION_TYPES) {
      const inResultState = a.name in RESULT_STATE;
      const mentioned = new RegExp(`"${a.name}"`).test(sugoPlanSource) || new RegExp(`"${a.name}"`).test(stateMachineSource);
      if (!inResultState && !mentioned) stray.push(a.name);
    }
    expect(stray).toEqual([]);
  });

  it("계층3 역방향: 소스에 온톨로지에 없는 유령 액션이 없다", () => {
    // sugoPlan.ts의 `action === "X"` 비교를 전부 긁어 온톨로지와 대조한다.
    const found = new Set<string>();
    for (const m of sugoPlanSource.matchAll(/action === "([a-z_]+)"/g)) found.add(m[1]);
    const known = new Set<string>(ontologyNames);
    expect([...found].filter((n) => !known.has(n))).toEqual([]);
  });

  it("toState가 있는 액션은 전부 RESULT_STATE에, 없는 액션은 없다", () => {
    for (const a of ACTION_TYPES) {
      if (a.toState === null) expect(a.name in RESULT_STATE, `${a.name}은 기록성 액션`).toBe(false);
      else expect(RESULT_STATE[a.name]).toBe(a.toState);
    }
  });

  it("PREREQUISITES는 fromStates!==null인 액션만 담는다(§2.8 파생 규칙)", () => {
    for (const a of ACTION_TYPES) {
      if (a.fromStates === null) expect(a.name in PREREQUISITES).toBe(false);
      else expect([...(PREREQUISITES[a.name] ?? [])]).toEqual([...a.fromStates]);
    }
  });

  it("NEXT_ACTION_HINTS의 리드 액션은 그 상태에서 실제로 허용된다(힌트가 막힌 길을 가리키지 않음)", () => {
    for (const state of WORKFLOW_STATES) {
      for (const hint of NEXT_ACTION_HINTS[state]) {
        expect(ALLOWED_ACTIONS_BY_STATE[state], `${state} 힌트 ${hint}`).toContain(hint);
      }
    }
  });

  it("모든 상태에서 status는 허용된다(관측은 절대 막지 않는다)", () => {
    for (const state of WORKFLOW_STATES) expect(ALLOWED_ACTIONS_BY_STATE[state]).toContain("status");
  });

  it("전이의 도달성: 모든 상태가 어떤 액션의 toState이거나 INIT이다(고아 상태 없음)", () => {
    const reachable = new Set<string>(["INIT"]);
    for (const a of ACTION_TYPES) if (a.toState) reachable.add(a.toState);
    expect(WORKFLOW_STATES.filter((s) => !reachable.has(s))).toEqual([]);
  });
});

/**
 * §4 Golden per-state action set — 파생 결과가 스펙 실측 표와 **정확히** 일치함을 증명한다.
 * 이 표는 손으로 옮겨적은 독립 사본이다(파생 로직으로 다시 계산하면 순환 테스트가 된다).
 */
describe("§4 Golden per-state action set", () => {
  const GOLDEN: Record<WorkflowState, string[]> = {
    INIT: ["start", "status"],
    SCAN: ["clarify", "status", "cancel"],
    CLARIFY: ["prd", "status", "cancel"],
    PRD: ["oracle_done", "decompose", "jira", "ready", "status", "cancel"],
    DECOMPOSE: ["subtask_start", "status", "cancel"],
    ORCHESTRATING: ["subtask_start", "subtask_done", "integrate", "status", "cancel"],
    JIRA: ["oracle_done", "ready", "status", "cancel"],
    READY: ["baseline_capture", "status", "cancel"],
    BASELINE: ["contract_start", "status", "cancel"],
    CONTRACT_RUNNING: ["contract_done", "status", "cancel"],
    CODE_READY: ["code_start", "status", "cancel"],
    CODE_RUNNING: ["code_done", "status"],
    CODE_DONE: ["test_start", "status"],
    TEST_RUNNING: ["test_done", "status"],
    TEST_DONE: ["review_start", "code_start", "status"],
    REVIEW_RUNNING: ["review_done", "code_start", "status"],
    DOCS_PENDING: ["docs_done", "status", "cancel"],
    COMMIT_PENDING: ["commit", "status", "cancel"],
    DONE: ["status", "start"],
  };

  it.each(WORKFLOW_STATES)("%s의 허용 액션 집합이 골든 표와 같다", (state) => {
    expect([...ALLOWED_ACTIONS_BY_STATE[state]].sort()).toEqual([...GOLDEN[state]].sort());
  });

  it("골든 표가 19개 상태를 빠짐없이 덮는다", () => {
    expect(Object.keys(GOLDEN).sort()).toEqual([...WORKFLOW_STATES].sort());
  });
});

/** 설계안 "순서강제(Gate Keeper)" 행 — 반드시 거부 / 반드시 허용. */
describe("설계안 코퍼스: 순서강제", () => {
  it("거부: READY에서 code_start 직행(CODE_READY 아님)", () => {
    expect(ALLOWED_ACTIONS_BY_STATE.READY).not.toContain("code_start");
  });

  it("거부: CODE_DONE에서 test_start를 건너뛰고 test_done", () => {
    expect(ALLOWED_ACTIONS_BY_STATE.CODE_DONE).not.toContain("test_done");
  });

  it("거부: 에이전트 체인 구간(CODE_RUNNING~REVIEW_RUNNING)에서 cancel", () => {
    for (const s of ["CODE_RUNNING", "CODE_DONE", "TEST_RUNNING", "TEST_DONE", "REVIEW_RUNNING"] as const) {
      expect(ALLOWED_ACTIONS_BY_STATE[s], s).not.toContain("cancel");
    }
  });

  it("거부: 진행 중 상태에서 start(세션 덮어쓰기)", () => {
    for (const s of WORKFLOW_STATES.filter((x) => x !== "INIT" && x !== "DONE")) {
      expect(ALLOWED_ACTIONS_BY_STATE[s], s).not.toContain("start");
    }
  });

  it("허용: 전제 상태 충족 — CODE_READY에서 code_start", () => {
    expect(ALLOWED_ACTIONS_BY_STATE.CODE_READY).toContain("code_start");
  });

  it("허용(v2 데드락 수정): oracle_done이 PRD·JIRA 양쪽에서 열린다", () => {
    expect(ALLOWED_ACTIONS_BY_STATE.PRD).toContain("oracle_done");
    expect(ALLOWED_ACTIONS_BY_STATE.JIRA).toContain("oracle_done");
  });

  it("허용(v2 데드락 수정): code_start가 auto-loop 역방향 2개에서 열린다", () => {
    expect(ALLOWED_ACTIONS_BY_STATE.TEST_DONE).toContain("code_start");
    expect(ALLOWED_ACTIONS_BY_STATE.REVIEW_RUNNING).toContain("code_start");
  });

  it("허용: jira 경유·미경유 양쪽에서 ready가 열린다", () => {
    expect(ALLOWED_ACTIONS_BY_STATE.PRD).toContain("ready");
    expect(ALLOWED_ACTIONS_BY_STATE.JIRA).toContain("ready");
  });
});
