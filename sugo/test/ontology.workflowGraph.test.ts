import { describe, expect, it } from "vitest";
import { analyzeWorkflowGraph } from "../src/ontology/workflowGraph.js";
import { ACTION_TYPES, INTENTIONAL_WORKFLOW_CYCLES, WORKFLOW_STATES } from "../src/ontology/model.js";

describe("P4 workflow graph contract", () => {
  it("INIT에서 모든 상태에 도달하고 모든 상태가 DONE으로 탈출할 수 있다", () => {
    const result = analyzeWorkflowGraph(WORKFLOW_STATES, ACTION_TYPES, INTENTIONAL_WORKFLOW_CYCLES);
    expect(result.unreachableFromInit).toEqual([]);
    expect(result.cannotReachDone).toEqual([]);
  });

  it("발견된 cycle은 명시적으로 이름 붙인 허용 cycle과 정확히 일치한다", () => {
    const result = analyzeWorkflowGraph(WORKFLOW_STATES, ACTION_TYPES, INTENTIONAL_WORKFLOW_CYCLES);
    expect(result.unexpectedCycles).toEqual([]);
    expect(result.staleCycleDeclarations).toEqual([]);
    expect(result.cycles.map((cycle) => cycle.states)).toEqual([
      ["ORCHESTRATING"],
      ["CODE_RUNNING", "CODE_DONE", "TEST_RUNNING", "TEST_DONE", "REVIEW_RUNNING"],
    ]);
  });

  it("DONE 출구를 끊은 선언 회귀를 탐지한다", () => {
    const withoutCommit = ACTION_TYPES.filter((action) => action.name !== "commit");
    const result = analyzeWorkflowGraph(WORKFLOW_STATES, withoutCommit, INTENTIONAL_WORKFLOW_CYCLES);
    expect(result.cannotReachDone).toContain("COMMIT_PENDING");
    expect(result.cannotReachDone).not.toContain("DONE");
  });

  it("새 cycle을 허용목록에 몰래 넣지 않으면 실패 대상으로 분류한다", () => {
    const withAccidentalCycle = [
      ...ACTION_TYPES,
      { name: "accidental_restart", fromStates: ["DOCS_PENDING"], toState: "SCAN", gates: [] },
    ];
    const result = analyzeWorkflowGraph(WORKFLOW_STATES, withAccidentalCycle, INTENTIONAL_WORKFLOW_CYCLES);
    expect(result.unexpectedCycles.length).toBeGreaterThan(0);
    expect(result.unexpectedCycles.flatMap((cycle) => cycle.states)).toContain("SCAN");
  });
});
