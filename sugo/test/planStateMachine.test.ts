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
  // v2 §2.4: decompose의 진입점은 READY가 아니라 **PRD**다. 비대 PRD를 쪼개는 결정은 PRD를
  // 쓴 직후에 내리는 것이지, ready(구현 착수 승인)를 받은 뒤가 아니다.
  it("PRD에서 decompose로 진입할 수 있다", () => {
    const result = applyTransition(sessionAt("PRD"), "decompose", "sid", {});
    expect(result.ok).toBe(true);
    expect(result.session?.state).toBe("DECOMPOSE");
  });

  it("READY에서 decompose는 거부된다(v2에서 진입점이 PRD로 옮겨짐)", () => {
    const result = applyTransition(sessionAt("READY"), "decompose", "sid", {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PREREQUISITE_FAILED");
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

  // v2 §2.4/§4 흐름도: integrate는 CODE_RUNNING이 아니라 **DOCS_PENDING**으로 합류한다.
  // 서브태스크 각각이 이미 자기 구현을 끝낸 상태라, 통합 후에는 코딩 단계로 되돌아갈 게 아니라
  // 문서화→커밋으로 이어진다.
  it("ORCHESTRATING에서 integrate로 DOCS_PENDING에 합류한다", () => {
    const result = applyTransition(sessionAt("ORCHESTRATING"), "integrate", "sid", {});
    expect(result.ok).toBe(true);
    expect(result.session?.state).toBe("DOCS_PENDING");
  });

  it("DECOMPOSE를 거치지 않고 바로 subtask_done을 호출하면 거부된다", () => {
    const result = applyTransition(sessionAt("DECOMPOSE"), "subtask_done", "sid", {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PREREQUISITE_FAILED");
  });

  it("PRD가 아닌 상태에서 decompose를 호출하면 거부된다", () => {
    const result = applyTransition(sessionAt("CODE_RUNNING"), "decompose", "sid", {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PREREQUISITE_FAILED");
  });

  it("integrate 이후 DOCS_PENDING에서 docs_done→commit으로 이어진다", () => {
    let s = applyTransition(sessionAt("ORCHESTRATING"), "integrate", "sid", {}).session!;
    expect(s.state).toBe("DOCS_PENDING");
    s = applyTransition(s, "docs_done", s.id, {}).session!;
    expect(s.state).toBe("COMMIT_PENDING");
    s = applyTransition(s, "commit", s.id, {}).session!;
    expect(s.state).toBe("DONE");
  });
});

/**
 * v2 §2.4 신규 액션. `oracle_done`은 **상태를 바꾸지 않는** 유일한 기록성 액션이라 전이 로직에서
 * 별도 취급된다 — 이게 깨지면 PRD/JIRA 중 한쪽에서만 오라클을 기록할 수 있게 되어 ready가
 * 영영 안 열리는 데드락이 재발한다.
 */
describe("v2 신규 액션 — jira / oracle_done", () => {
  it("PRD에서 jira로 진입한다", () => {
    const result = applyTransition(sessionAt("PRD"), "jira", "sid", {});
    expect(result.ok).toBe(true);
    expect(result.session?.state).toBe("JIRA");
  });

  it("JIRA에서 ready로 이어진다", () => {
    const result = applyTransition(sessionAt("JIRA"), "ready", "sid", {});
    expect(result.ok).toBe(true);
    expect(result.session?.state).toBe("READY");
  });

  it("jira를 건너뛰고 PRD에서 곧장 ready로도 갈 수 있다", () => {
    const result = applyTransition(sessionAt("PRD"), "ready", "sid", {});
    expect(result.ok).toBe(true);
    expect(result.session?.state).toBe("READY");
  });

  it("oracle_done은 PRD에서 상태를 바꾸지 않는다", () => {
    const result = applyTransition(sessionAt("PRD"), "oracle_done", "sid", {});
    expect(result.ok).toBe(true);
    expect(result.session?.state).toBe("PRD");
  });

  it("oracle_done은 JIRA에서도 상태를 바꾸지 않는다(양쪽 진입 — 데드락 수정)", () => {
    const result = applyTransition(sessionAt("JIRA"), "oracle_done", "sid", {});
    expect(result.ok).toBe(true);
    expect(result.session?.state).toBe("JIRA");
  });

  it("PRD/JIRA가 아닌 상태에서 oracle_done은 거부된다", () => {
    const result = applyTransition(sessionAt("READY"), "oracle_done", "sid", {});
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PREREQUISITE_FAILED");
  });
});
