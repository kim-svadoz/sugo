import { describe, expect, it } from "vitest";
import { buildCompletionPlan, currentBlockers, remainingSteps } from "../src/completionPlan.js";
import type { ChainInfo } from "../src/types.js";

function chain(overrides: Partial<ChainInfo> = {}): ChainInfo {
  return {
    changedFiles: [],
    analyzeAttempts: 0,
    analyzePassed: null,
    testPassedState: null,
    reviewPassed: null,
    autoLoopRetryCount: 0,
    ...overrides,
  } as ChainInfo;
}

describe("remainingSteps — DONE까지 남은 경로", () => {
  it("REVIEW_RUNNING에서는 review_done → docs_done → commit이 남는다", () => {
    expect(remainingSteps("REVIEW_RUNNING").map((s) => s.action)).toEqual(["review_done", "docs_done", "commit"]);
  });

  it("COMMIT_PENDING에서는 commit 하나만 남는다", () => {
    expect(remainingSteps("COMMIT_PENDING").map((s) => s.action)).toEqual(["commit"]);
  });

  it("DONE에서는 남은 게 없다", () => {
    expect(remainingSteps("DONE")).toEqual([]);
  });

  it("마지막 단계의 도착 상태는 DONE이다", () => {
    const steps = remainingSteps("CODE_RUNNING");
    expect(steps[steps.length - 1]?.toState).toBe("DONE");
  });

  it("되돌아가기(code_start)는 남은 일에 넣지 않는다", () => {
    // REVIEW_RUNNING에서 code_start로 갈 수는 있지만 그건 선택지이지 완주에 필요한 단계가 아니다.
    expect(remainingSteps("REVIEW_RUNNING").map((s) => s.action)).not.toContain("code_start");
  });

  it("각 단계가 요구하는 인자를 함께 알려준다", () => {
    const reviewDone = remainingSteps("REVIEW_RUNNING").find((s) => s.action === "review_done");
    expect(reviewDone?.requires).toContain("userConfirmed");
    expect(reviewDone?.requires).toContain("summary");
  });

  it("추가 인자가 없는 단계는 빈 배열이다", () => {
    expect(remainingSteps("DOCS_PENDING").find((s) => s.action === "docs_done")?.requires).toEqual([]);
  });
});

describe("currentBlockers — 실패한 것만 싣는다", () => {
  it("아직 안 한 것은 blocker가 아니다", () => {
    // analyzePassed:null은 "아직 안 돌렸다"이지 "실패했다"가 아니다.
    expect(currentBlockers(chain())).toEqual([]);
  });

  it("analyze 실패를 verdict와 함께 싣는다", () => {
    expect(currentBlockers(chain({ analyzePassed: false, analyzeLastVerdict: "partial" }))).toContain(
      "analyze 미통과(partial)",
    );
  });

  it("test_done 스냅샷이 fail이면 test_reverify 경로를 알려준다", () => {
    expect(currentBlockers(chain({ testPassedState: "fail" }))[0]).toContain("test_reverify");
  });

  it("chainInfo가 없어도 깨지지 않는다", () => {
    expect(currentBlockers(undefined)).toEqual([]);
  });
});

describe("buildCompletionPlan", () => {
  it("남은 경로와 blocker를 함께 돌려준다", () => {
    const plan = buildCompletionPlan("REVIEW_RUNNING", chain({ analyzePassed: false, testPassedState: "fail" }));
    expect(plan.remaining.map((s) => s.action)).toEqual(["review_done", "docs_done", "commit"]);
    expect(plan.blockers.length).toBe(2);
  });
});
