import { describe, expect, it } from "vitest";
import { applyTransition, checkPrerequisite } from "../src/planStateMachine.js";
import type { PlanSession } from "../src/types.js";
import { createEmptySessionData } from "../src/types.js";

function sessionAt(state: PlanSession["state"]): PlanSession {
  return {
    id: "plan-test-0000",
    state,
    projectPath: "/tmp/project",
    featureName: "feature-x",
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    data: createEmptySessionData(),
  };
}

describe("순서강제 게이트 (설계안: Gate Keeper) — 반드시 거부", () => {
  it("READY 상태에서 test_start를 호출하면 차단된다 (CODE_RUNNING/CODE_DONE 건너뛰기)", () => {
    const result = applyTransition(sessionAt("READY"), "test_start", "sid", {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PREREQUISITE_FAILED");
  });

  it("v1 스펙 델타(§3 선형화): READY에서 code_start로 직행하면 차단된다(CODE_READY 아님)", () => {
    const result = applyTransition(sessionAt("READY"), "code_start", "sid", {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PREREQUISITE_FAILED");
  });

  it("BASELINE에서 code_start로 직행하면 차단된다(CONTRACT_RUNNING/CODE_READY 건너뛰기)", () => {
    const result = applyTransition(sessionAt("BASELINE"), "code_start", "sid", {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PREREQUISITE_FAILED");
  });

  it("READY에서 contract_start로 직행하면 차단된다(BASELINE을 건너뛰기)", () => {
    const result = applyTransition(sessionAt("READY"), "contract_start", "sid", {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PREREQUISITE_FAILED");
  });

  it("BASELINE에서 contract_done으로 직행하면 차단된다(CONTRACT_RUNNING을 건너뛰기)", () => {
    const result = applyTransition(sessionAt("BASELINE"), "contract_done", "sid", {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PREREQUISITE_FAILED");
  });

  it("CODE_RUNNING 상태에서 review_start를 호출하면 차단된다", () => {
    const result = applyTransition(sessionAt("CODE_RUNNING"), "review_start", "sid", {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PREREQUISITE_FAILED");
  });

  it("세션 없이 code_done을 호출하면 SESSION_NOT_FOUND로 차단된다", () => {
    const result = applyTransition(null, "code_done", "sid", {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("SESSION_NOT_FOUND");
  });

  it("DONE 상태에서 commit을 다시 호출하면 차단된다 (COMMIT_PENDING 아님)", () => {
    const result = applyTransition(sessionAt("DONE"), "commit", "sid", {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PREREQUISITE_FAILED");
  });

  it("이미 취소된 세션을 다시 취소하면 차단된다", () => {
    const cancelled: PlanSession = { ...sessionAt("PRD"), cancelledAt: "2026-01-01T00:00:00.000Z" };
    const result = applyTransition(cancelled, "cancel", "sid", {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("ALREADY_CANCELLED");
  });

  it("start에 projectPath가 없으면 차단된다", () => {
    const result = applyTransition(null, "start", "sid", {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("MISSING_PROJECT_PATH");
  });
});

describe("순서강제 게이트 — 반드시 허용", () => {
  it("전제 상태를 충족한 액션은 통과하고 다음 상태로 전이한다", () => {
    const result = applyTransition(sessionAt("CODE_READY"), "code_start", "sid", {});
    expect(result.ok).toBe(true);
    expect(result.session?.state).toBe("CODE_RUNNING");
  });

  it("v1 스펙 델타(§3): READY→BASELINE→CONTRACT_RUNNING→CODE_READY 선형화가 순서대로 통과한다", () => {
    let s = applyTransition(sessionAt("READY"), "baseline_capture", "sid", {}).session!;
    expect(s.state).toBe("BASELINE");
    s = applyTransition(s, "contract_start", s.id, {}).session!;
    expect(s.state).toBe("CONTRACT_RUNNING");
    s = applyTransition(s, "contract_done", s.id, {}).session!;
    expect(s.state).toBe("CODE_READY");
    s = applyTransition(s, "code_start", s.id, {}).session!;
    expect(s.state).toBe("CODE_RUNNING");
  });

  it("전체 해피패스 체인이 순서대로 통과한다: start~commit", () => {
    let s = applyTransition(null, "start", "s1", { projectPath: "/tmp/p", featureName: "f" }).session!;
    expect(s.state).toBe("SCAN");

    s = applyTransition(s, "clarify", s.id, {}).session!;
    expect(s.state).toBe("CLARIFY");

    s = applyTransition(s, "prd", s.id, {}).session!;
    expect(s.state).toBe("PRD");

    s = applyTransition(s, "ready", s.id, {}).session!;
    expect(s.state).toBe("READY");

    s = applyTransition(s, "baseline_capture", s.id, {}).session!;
    expect(s.state).toBe("BASELINE");

    s = applyTransition(s, "contract_start", s.id, {}).session!;
    expect(s.state).toBe("CONTRACT_RUNNING");

    s = applyTransition(s, "contract_done", s.id, {}).session!;
    expect(s.state).toBe("CODE_READY");

    s = applyTransition(s, "code_start", s.id, {}).session!;
    expect(s.state).toBe("CODE_RUNNING");

    s = applyTransition(s, "code_done", s.id, {}).session!;
    expect(s.state).toBe("CODE_DONE");

    s = applyTransition(s, "test_start", s.id, {}).session!;
    expect(s.state).toBe("TEST_RUNNING");

    s = applyTransition(s, "test_done", s.id, {}).session!;
    expect(s.state).toBe("TEST_DONE");

    s = applyTransition(s, "review_start", s.id, {}).session!;
    expect(s.state).toBe("REVIEW_RUNNING");

    s = applyTransition(s, "review_done", s.id, {}).session!;
    expect(s.state).toBe("DOCS_PENDING");

    s = applyTransition(s, "docs_done", s.id, {}).session!;
    expect(s.state).toBe("COMMIT_PENDING");

    s = applyTransition(s, "commit", s.id, {}).session!;
    expect(s.state).toBe("DONE");
  });

  it("auto-loop: TEST_DONE에서 code_start로 역방향 재진입이 허용된다", () => {
    const result = applyTransition(sessionAt("TEST_DONE"), "code_start", "sid", {});
    expect(result.ok).toBe(true);
    expect(result.session?.state).toBe("CODE_RUNNING");
  });

  it("auto-loop: REVIEW_RUNNING에서 code_start로 역방향 재진입이 허용된다 (validation 실패 시)", () => {
    const result = applyTransition(sessionAt("REVIEW_RUNNING"), "code_start", "sid", {});
    expect(result.ok).toBe(true);
    expect(result.session?.state).toBe("CODE_RUNNING");
  });

  it("cancel은 임의 상태에서 허용된다", () => {
    const result = applyTransition(sessionAt("CODE_RUNNING"), "cancel", "sid", {});
    expect(result.ok).toBe(true);
    expect(result.session?.cancelledAt).toBeDefined();
  });

  it("status는 세션이 없어도 허용되고 start를 힌트로 준다", () => {
    const result = applyTransition(null, "status", "sid", {});
    expect(result.ok).toBe(true);
    expect(result.nextActionHints).toEqual(["start"]);
  });
});

describe("checkPrerequisite 단위 동작", () => {
  it("전제상태가 없는 action(start/status/cancel)은 항상 ok", () => {
    expect(checkPrerequisite("start", null).ok).toBe(true);
    expect(checkPrerequisite("status", "DONE").ok).toBe(true);
  });

  it("전제상태 배열에 현재 상태가 없으면 PREREQUISITE_FAILED", () => {
    const result = checkPrerequisite("prd", "SCAN");
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PREREQUISITE_FAILED");
  });
});

describe("§10 decompose 오케스트레이션 — 순서강제", () => {
  it("READY에서 decompose로 진입할 수 있다", () => {
    const result = applyTransition(sessionAt("READY"), "decompose", "sid", {});
    expect(result.ok).toBe(true);
    expect(result.session?.state).toBe("DECOMPOSE");
  });

  it("DECOMPOSE에서 subtask_start로 ORCHESTRATING에 진입한다", () => {
    const result = applyTransition(sessionAt("DECOMPOSE"), "subtask_start", "sid", {});
    expect(result.ok).toBe(true);
    expect(result.session?.state).toBe("ORCHESTRATING");
  });

  it("ORCHESTRATING에서 subtask_start를 반복해도 ORCHESTRATING을 유지한다", () => {
    const result = applyTransition(sessionAt("ORCHESTRATING"), "subtask_start", "sid", {});
    expect(result.ok).toBe(true);
    expect(result.session?.state).toBe("ORCHESTRATING");
  });

  it("ORCHESTRATING에서 subtask_done은 ORCHESTRATING을 유지한다", () => {
    const result = applyTransition(sessionAt("ORCHESTRATING"), "subtask_done", "sid", {});
    expect(result.ok).toBe(true);
    expect(result.session?.state).toBe("ORCHESTRATING");
  });

  it("ORCHESTRATING에서 integrate로 CODE_RUNNING에 합류한다(기존 파이프라인 재사용)", () => {
    const result = applyTransition(sessionAt("ORCHESTRATING"), "integrate", "sid", {});
    expect(result.ok).toBe(true);
    expect(result.session?.state).toBe("CODE_RUNNING");
  });

  it("DECOMPOSE를 거치지 않고 바로 subtask_done을 호출하면 거부된다", () => {
    const result = applyTransition(sessionAt("DECOMPOSE"), "subtask_done", "sid", {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PREREQUISITE_FAILED");
  });

  it("READY가 아닌 상태에서 decompose를 호출하면 거부된다", () => {
    const result = applyTransition(sessionAt("CODE_RUNNING"), "decompose", "sid", {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PREREQUISITE_FAILED");
  });

  it("integrate 이후 CODE_RUNNING에서 정상적으로 code_done까지 이어진다", () => {
    let s = applyTransition(sessionAt("ORCHESTRATING"), "integrate", "sid", {}).session!;
    expect(s.state).toBe("CODE_RUNNING");
    s = applyTransition(s, "code_done", s.id, {}).session!;
    expect(s.state).toBe("CODE_DONE");
  });
});
