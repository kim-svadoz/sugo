import { describe, expect, it } from "vitest";
import { computeJudgmentReport } from "../src/judgment.js";
import { createEmptySessionData, type PlanSession } from "../src/types.js";

let seq = 0;
function makeSession(overrides: Partial<PlanSession> = {}, dataOverrides: Partial<PlanSession["data"]> = {}): PlanSession {
  seq++;
  return {
    id: `plan-test-${seq}`,
    state: "DONE",
    projectPath: "/tmp/project",
    featureName: "feature",
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    data: { ...createEmptySessionData(), ...dataOverrides },
    ...overrides,
  };
}

describe("computeJudgmentReport", () => {
  it("빈 배열이면 모든 집계가 0/null이다", () => {
    const report = computeJudgmentReport([]);
    expect(report.totalSessions).toBe(0);
    expect(report.avgReviewToCommitMinutes).toBeNull();
    expect(report.maxReviewToCommitMinutes).toBeNull();
    expect(report.environmentAbsentRate).toBe(0);
    expect(report.topGaps).toEqual([]);
  });

  it("patchSessions는 mode==='patch'인 세션만 센다", () => {
    const sessions = [
      makeSession({}, { mode: "plan" }),
      makeSession({}, { mode: "patch" }),
      makeSession({}, { mode: "patch" }),
    ];
    expect(computeJudgmentReport(sessions).patchSessions).toBe(2);
  });

  it("review_done→commit 갭을 정확히 계산한다", () => {
    const sessions = [
      makeSession(
        { updatedAt: "2026-01-01T01:00:00.000Z" },
        { chainInfo: { ...createEmptySessionData().chainInfo, reviewDoneAt: "2026-01-01T00:00:00.000Z" } },
      ),
      makeSession(
        { updatedAt: "2026-01-01T00:10:00.000Z" },
        { chainInfo: { ...createEmptySessionData().chainInfo, reviewDoneAt: "2026-01-01T00:00:00.000Z" } },
      ),
    ];
    const report = computeJudgmentReport(sessions);
    expect(report.avgReviewToCommitMinutes).toBeCloseTo((60 + 10) / 2, 5);
    expect(report.maxReviewToCommitMinutes).toBe(60);
    expect(report.topGaps[0].gapMinutes).toBe(60);
  });

  it("DONE 상태가 아니면 갭 계산에서 제외한다", () => {
    const sessions = [
      makeSession(
        { state: "REVIEW_RUNNING" },
        { chainInfo: { ...createEmptySessionData().chainInfo, reviewDoneAt: "2026-01-01T00:00:00.000Z" } },
      ),
    ];
    expect(computeJudgmentReport(sessions).avgReviewToCommitMinutes).toBeNull();
  });

  it("환경부재 라벨(test/baseline unverified, boot/runtime 라벨) 중 하나라도 쓰면 남용률에 반영된다", () => {
    const withUnverifiedTest = makeSession(
      {},
      { chainInfo: { ...createEmptySessionData().chainInfo, testEvidence: { command: "x", kind: "feature", recordedAt: "x", derivedState: "unverified" } } },
    );
    const clean = makeSession();
    const report = computeJudgmentReport([withUnverifiedTest, clean]);
    expect(report.environmentAbsentRate).toBeCloseTo(0.5, 5);
  });

  it("bootUnverifiedReason 사용 세션을 센다", () => {
    const sessions = [
      makeSession({}, { chainInfo: { ...createEmptySessionData().chainInfo, codeGateAudit: { bootUnverifiedReason: "환경없음" } } }),
      makeSession(),
    ];
    expect(computeJudgmentReport(sessions).bootUnverifiedSessions).toBe(1);
  });

  it("runtimeCheckUnverifiedReason 사용 세션을 센다", () => {
    const sessions = [
      makeSession({}, { chainInfo: { ...createEmptySessionData().chainInfo, runtimeCheckUnverifiedReason: "환경없음" } }),
      makeSession(),
    ];
    expect(computeJudgmentReport(sessions).runtimeUnverifiedSessions).toBe(1);
  });

  it("fabricatedCount>0인 lastValidation을 가진 세션을 센다", () => {
    const sessions = [
      makeSession(
        {},
        {
          chainInfo: {
            ...createEmptySessionData().chainInfo,
            lastValidation: {
              verdict: "pass",
              checkedAt: "x",
              fabricatedCount: 1,
              contradictionCount: 0,
              autoVerifiedCount: 0,
              verifiedFailures: [],
            },
          },
        },
      ),
      makeSession(
        {},
        {
          chainInfo: {
            ...createEmptySessionData().chainInfo,
            lastValidation: {
              verdict: "pass",
              checkedAt: "x",
              fabricatedCount: 0,
              contradictionCount: 0,
              autoVerifiedCount: 0,
              verifiedFailures: [],
            },
          },
        },
      ),
    ];
    expect(computeJudgmentReport(sessions).fabricatedValidationSessions).toBe(1);
  });

  it("autoLoopRetryCount를 합산하고 재시도가 있었던 세션 수를 센다", () => {
    const sessions = [
      makeSession({}, { chainInfo: { ...createEmptySessionData().chainInfo, autoLoopRetryCount: 2 } }),
      makeSession({}, { chainInfo: { ...createEmptySessionData().chainInfo, autoLoopRetryCount: 1 } }),
      makeSession(),
    ];
    const report = computeJudgmentReport(sessions);
    expect(report.reviewLoopRetryTotal).toBe(3);
    expect(report.sessionsWithReviewLoop).toBe(2);
  });
});
