import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoAdd } from "../src/tools/sugoAdd.js";
import { handleSugoAnalyze } from "../src/tools/sugoAnalyze.js";
import { handleSugoStatus } from "../src/tools/sugoStatus.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";
import { handleSugoRecordTestEvidence } from "../src/tools/sugoRecordTestEvidence.js";
import { handleSugoCheckLethalTrifecta } from "../src/tools/sugoCheckLethalTrifecta.js";
import { handleSugoValidate } from "../src/tools/sugoValidate.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(handler: (args: unknown) => Promise<any>, args: unknown) {
  const res = await handler(args);
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

const VALID_PRD = "REQ-1: 이메일 로그인 기능을 제공한다. " + "가".repeat(90);
const GOOD_SUMMARY = [
  "배경: 사용자가 이메일로 로그인할 수 없는 문제가 있었다.",
  "변경: EmailLoginService를 추가하고 컨트롤러에 연결했다.",
  "설계: 기존 인증 흐름을 재사용하며 비밀번호 해시는 bcrypt를 사용했다.",
  "테스트: 단위테스트 12개와 통합테스트 2개를 추가해 전부 통과를 확인했다.",
].join("\n");

const FULL_COVERAGE_MAP = {
  acceptanceCriteria: [{ id: "AC-1", covered: true }],
  responseFields: [{ field: "token", asserted: true }],
  integrationTestCount: 1,
  regressionChecked: true,
  regressionIntact: true,
};

let fakeHome: string;
let projectDir: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-cj-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "sugo-cj-project-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

async function toTestRunning(): Promise<string> {
  const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
  const sessionId = start.data.sessionId as string;
  await call(handleSugoPlan, { action: "clarify", sessionId });
  await call(handleSugoPlan, { action: "prd", sessionId, prdContent: VALID_PRD });
  await call(handleSugoPlan, { action: "ready", sessionId });
  await call(handleSugoPlan, { action: "baseline_capture", sessionId });
  await call(handleSugoPlan, { action: "contract_start", sessionId });
  await call(handleSugoPlan, { action: "contract_done", sessionId });
  await call(handleSugoPlan, { action: "code_start", sessionId });
  await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
  await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [] });
  await call(handleSugoPlan, { action: "test_start", sessionId });
  return sessionId;
}

describe("§10 PRD 정합성 게이트 — opt-in 꺼져있으면(기본) coverageMap 없이도 통과", () => {
  it("integrationGateEnforced 미설정이면 coverageMap 없이 test_done이 통과한다", async () => {
    const sessionId = await toTestRunning();
    await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 0, failed: 0 });
    const result = await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });
    expect(result.isError).toBe(false);
  });
});

describe("§10 PRD 정합성 게이트 — opt-in 켜져 있으면 강제", () => {
  it("coverageMap 없이 test_done을 호출하면 COVERAGE_MAP_REQUIRED로 거부한다", async () => {
    await call(handleSugoAdd, { projectPath: projectDir, integrationGateEnforced: true });
    const sessionId = await toTestRunning();
    await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 0, failed: 0 });
    const result = await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("COVERAGE_MAP_REQUIRED");
  });

  it("커버리지가 불완전한 coverageMap을 제출하면 거부한다", async () => {
    await call(handleSugoAdd, { projectPath: projectDir, integrationGateEnforced: true });
    const sessionId = await toTestRunning();
    await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 0, failed: 0 });
    const result = await call(handleSugoPlan, {
      action: "test_done",
      sessionId,
      testPassed: true,
      coverageMap: { ...FULL_COVERAGE_MAP, acceptanceCriteria: [{ id: "AC-1", covered: false }] },
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("PRD_COVERAGE_INCOMPLETE");
  });

  it("완전한 coverageMap을 제출하면 통과하고 세션에 보존된다", async () => {
    await call(handleSugoAdd, { projectPath: projectDir, integrationGateEnforced: true });
    const sessionId = await toTestRunning();
    await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 0, failed: 0 });
    const result = await call(handleSugoPlan, {
      action: "test_done",
      sessionId,
      testPassed: true,
      coverageMap: FULL_COVERAGE_MAP,
    });
    expect(result.isError).toBe(false);
    expect(result.data.state).toBe("TEST_DONE");
  });
});

describe("auto-loop 재시도 카운트 (§4.5 신호)", () => {
  it("TEST_DONE에서 code_start로 역방향 재진입하면 autoLoopRetryCount가 증가한다", async () => {
    const sessionId = await toTestRunning();
    await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 1, failed: 2 });
    await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: false });

    const retry1 = await call(handleSugoPlan, { action: "code_start", sessionId });
    expect(retry1.isError).toBe(false);

    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
    await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [] });
    await call(handleSugoPlan, { action: "test_start", sessionId });
    await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 0, failed: 0 });
    const testDone2 = await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });
    expect(testDone2.isError).toBe(false);

    await call(handleSugoPlan, { action: "review_start", sessionId });
    await call(handleSugoValidate, { sessionId: sessionId, validationResults: [] }); // VALIDATE_NOT_CALLED 게이트 충족용
    await call(handleSugoCheckLethalTrifecta, { sessionId: sessionId, tools: [] }); // LETHAL_TRIFECTA_NOT_CALLED 게이트 충족용
    const reviewDone = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    expect(reviewDone.data.humanHoursEstimate.estimationBasis).toContain("재시도 1회");
  });

  it("최초 READY→CODE_RUNNING 진입은 재시도로 카운트하지 않는다", async () => {
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "x" });
    const sessionId = start.data.sessionId;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    await call(handleSugoPlan, { action: "prd", sessionId, prdContent: VALID_PRD });
    await call(handleSugoPlan, { action: "ready", sessionId });
    await call(handleSugoPlan, { action: "baseline_capture", sessionId });
    await call(handleSugoPlan, { action: "contract_start", sessionId });
    await call(handleSugoPlan, { action: "contract_done", sessionId });
    await call(handleSugoPlan, { action: "code_start", sessionId });

    const report = await call(handleSugoStatus, { judgment: true });
    const thisSession = report.data.judgment.sessionsWithReviewLoop;
    expect(thisSession).toBe(0);
  });
});

describe("sugo_hulk(judgment) — sugo_judgment_report 흡수, 전체 흐름 집계", () => {
  it("완료된 세션들의 신호를 정확히 집계한다", async () => {
    // 세션 1: 정상 완료(환경부재 없음)
    const s1 = await toTestRunning();
    await call(handleSugoRecordTestEvidence, { sessionId: s1, command: "npm test", exitCode: 0, failed: 0 });
    await call(handleSugoPlan, { action: "test_done", sessionId: s1, testPassed: true });
    await call(handleSugoPlan, { action: "review_start", sessionId: s1 });
    await call(handleSugoValidate, { sessionId: s1, validationResults: [] }); // VALIDATE_NOT_CALLED 게이트 충족용
    await call(handleSugoCheckLethalTrifecta, { sessionId: s1, tools: [] }); // LETHAL_TRIFECTA_NOT_CALLED 게이트 충족용
    await call(handleSugoPlan, {
      action: "review_done",
      sessionId: s1,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    await call(handleSugoPlan, { action: "docs_done", sessionId: s1 });
    await call(handleSugoPlan, { action: "commit", sessionId: s1 });

    // 세션 2: 환경부재 라벨(runtime unverified) 사용
    const projectDir2 = mkdtempSync(join(tmpdir(), "sugo-cj-project2-"));
    const start2 = await call(handleSugoPlan, { action: "start", projectPath: projectDir2, featureName: "y" });
    const s2 = start2.data.sessionId;
    await call(handleSugoPlan, { action: "clarify", sessionId: s2 });
    await call(handleSugoPlan, { action: "prd", sessionId: s2, prdContent: VALID_PRD });
    await call(handleSugoPlan, { action: "ready", sessionId: s2 });
    await call(handleSugoPlan, { action: "baseline_capture", sessionId: s2 });
    await call(handleSugoPlan, { action: "contract_start", sessionId: s2 });
    await call(handleSugoPlan, { action: "contract_done", sessionId: s2 });
    await call(handleSugoPlan, { action: "code_start", sessionId: s2 });
    await call(handleSugoAnalyze, { sessionId: s2, changedFiles: [] });
    await call(handleSugoPlan, { action: "code_done", sessionId: s2, changedFiles: [] });
    await call(handleSugoPlan, { action: "test_start", sessionId: s2 });
    // §4.6 label-guard: 이 세션은 "환경 자체가 없다"는 일관된 이야기여야 한다 — test_done에서
    // 이미 그린으로 통과했는데 review_done에서 환경부재를 주장하면 라벨-모순으로 거부되기 때문에,
    // test evidence도 함께 unverified로 기록한다(테스트가 실제로 검증됐다는 증거가 세션에 없어야 함).
    await call(handleSugoRecordTestEvidence, { sessionId: s2, command: "npm test", unverified: true, unverifiedReason: "환경 없음" });
    await call(handleSugoPlan, { action: "test_done", sessionId: s2, testPassed: false });
    await call(handleSugoPlan, { action: "review_start", sessionId: s2 });
    await call(handleSugoValidate, { sessionId: s2, validationResults: [] }); // VALIDATE_NOT_CALLED 게이트 충족용
    await call(handleSugoCheckLethalTrifecta, { sessionId: s2, tools: [] }); // LETHAL_TRIFECTA_NOT_CALLED 게이트 충족용
    await call(handleSugoPlan, {
      action: "review_done",
      sessionId: s2,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: false, testRun: false, runtimeVerified: false, unverifiedReason: "환경 없음" },
    });
    await call(handleSugoPlan, { action: "docs_done", sessionId: s2 });
    await call(handleSugoPlan, { action: "commit", sessionId: s2 });
    rmSync(projectDir2, { recursive: true, force: true });

    const report = await call(handleSugoStatus, { judgment: true });
    expect(report.data.judgment.totalSessions).toBe(2);
    expect(report.data.judgment.runtimeUnverifiedSessions).toBe(1);
    expect(report.data.judgment.environmentAbsentRate).toBeCloseTo(0.5, 5);
    expect(report.data.judgment.avgReviewToCommitMinutes).toBeGreaterThanOrEqual(0);
  });

  it("windowDays로 필터링할 수 있다(미래 시각 필터는 전부 제외)", async () => {
    const s1 = await toTestRunning();
    await call(handleSugoRecordTestEvidence, { sessionId: s1, command: "npm test", exitCode: 0, failed: 0 });
    await call(handleSugoPlan, { action: "test_done", sessionId: s1, testPassed: true });

    const reportAll = await call(handleSugoStatus, { judgment: true });
    expect(reportAll.data.judgment.totalSessions).toBeGreaterThanOrEqual(1);

    const reportNegativeWindow = await call(handleSugoStatus, { judgment: true, days: -1 });
    expect(reportNegativeWindow.data.judgment.totalSessions).toBe(0);
  });
});
