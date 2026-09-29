// 13게이트 유기적 완주 테스트 — feat/patch 파이프라인을 start→commit(DONE)까지 실제로 걸으며
// 각 게이트가 "증거 없으면 막고(정확한 errorCode) → 증거 주면 통과"를 순서대로 증명한다.
// 기존 테스트들이 게이트를 '개별로' 검증한다면, 이 파일은 하나의 연속 세션에서 게이트들이
// 배선 순서대로 유기적으로 도는지를 본다. HOME→tmpdir 실배선(mock 없음).
//
// 13게이트: (1)순서강제 (2)PRD콘텐츠 (3)baseline (4)contract-started (5)analyze
//   (6)wiring (7)registration-glue (8)boot (9)test-evidence (10)coverage
//   (11)user-confirmation (12)runtime-verification (13)contract-evidence
//   + label-guard(전 구간 관통) + 완료등급(commit).
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveProjectConfig } from "../src/harness/config.js";
import { handleSugoAnalyze } from "../src/tools/sugoAnalyze.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";
import { handleSugoRecordContractEvidence } from "../src/tools/sugoRecordContractEvidence.js";
import { handleSugoRecordTestEvidence } from "../src/tools/sugoRecordTestEvidence.js";
import { handleSugoCheckLethalTrifecta } from "../src/tools/sugoCheckLethalTrifecta.js";
import { handleSugoValidate } from "../src/tools/sugoValidate.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(handler: (args: unknown) => Promise<any>, args: unknown) {
  const res = await handler(args);
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

const SIGNAL_PRD = "REQ-1: JDK 버전을 상향하고 이메일 로그인 기능을 제공한다. " + "가".repeat(90);
const PLAIN_PRD = "REQ-1: 이메일 로그인 기능을 제공한다. " + "가".repeat(90);
const GOOD_SUMMARY = [
  "배경: 사용자가 이메일로 로그인할 수 없는 문제가 있었다.",
  "변경: EmailLoginService를 추가하고 컨트롤러에 연결했다.",
  "설계: 기존 인증 흐름을 재사용하며 비밀번호 해시는 bcrypt를 사용했다.",
  "테스트: 단위테스트 12개와 통합테스트 2개를 추가해 전부 통과를 확인했다.",
].join("\n");
const FULL_COVERAGE = {
  acceptanceCriteria: [{ id: "REQ-1", covered: true }],
  responseFields: [{ field: "token", asserted: true }],
  integrationTestCount: 2,
  regressionChecked: true,
  regressionIntact: true,
};
const INCOMPLETE_COVERAGE = { ...FULL_COVERAGE, acceptanceCriteria: [{ id: "REQ-1", covered: false }] };
const WIRING_FILE = "src/main/resources/application.yml";

let fakeHome: string;
let projectDir: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-13g-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "sugo-13g-project-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});
afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

async function markSpringBoot() {
  await saveProjectConfig({
    version: "0.1.0",
    projectPath: projectDir,
    projectName: "demo",
    registeredAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    detectedStack: {
      languages: [],
      frameworks: [{ id: "framework/spring/3.x", category: "framework", name: "Spring Boot", detectedBy: "pom.xml" }],
      dataStores: [],
      buildTools: [],
      infra: [],
      harnessIds: [],
      commands: {},
    },
    appliedHarnesses: [],
  });
}
function writeSpringBootTestAnnotation() {
  mkdirSync(join(projectDir, "src", "test", "java"), { recursive: true });
  writeFileSync(join(projectDir, "src", "test", "java", "AppContextLoadTest.java"), "package com.demo;\n\n@SpringBootTest\nclass AppContextLoadTest {}\n");
}

describe("13게이트 유기적 완주 — feat 파이프라인 (Spring Boot + baseline 시그널)", () => {
  it("각 게이트가 순서대로 막고→통과하며 start→commit(DONE, grade=verified)까지 완주한다", async () => {
    await markSpringBoot();

    // ── 세션 시작
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
    const sessionId = start.data.sessionId as string;

    // (게이트 1) 순서강제: SCAN 상태에서 code_start 직행은 거부
    const skip = await call(handleSugoPlan, { action: "code_start", sessionId });
    expect(skip.isError).toBe(true);
    expect(skip.data.errorCode).toBe("PREREQUISITE_FAILED");

    await call(handleSugoPlan, { action: "clarify", sessionId });

    // (게이트 2) PRD 콘텐츠: 짧으면 거부 → 유효하면 통과
    const shortPrd = await call(handleSugoPlan, { action: "prd", sessionId, prdContent: "짧음" });
    expect(shortPrd.data.errorCode).toBe("PRD_TOO_SHORT");
    const prd = await call(handleSugoPlan, { action: "prd", sessionId, prdContent: SIGNAL_PRD });
    expect(prd.isError).toBe(false);
    await call(handleSugoPlan, { action: "ready", sessionId });

    // (게이트 3) baseline: 시그널 PRD인데 그린 증거 없으면 baseline_capture 거부 → 기록하면 통과
    const noBaseline = await call(handleSugoPlan, { action: "baseline_capture", sessionId });
    expect(noBaseline.data.errorCode).toBe("BASELINE_NOT_GREEN");
    await call(handleSugoRecordTestEvidence, { sessionId, kind: "baseline", command: "./gradlew test", exitCode: 0, failed: 0 });
    const baselineOk = await call(handleSugoPlan, { action: "baseline_capture", sessionId });
    expect(baselineOk.data.state).toBe("BASELINE");

    // (게이트 4) contract-started: 필수인데 red 확인 없으면 contract_done 거부 → red 기록하면 통과
    await call(handleSugoPlan, { action: "contract_start", sessionId });
    const noRed = await call(handleSugoPlan, { action: "contract_done", sessionId });
    expect(noRed.data.errorCode).toBe("CONTRACT_NOT_STARTED");
    await call(handleSugoRecordContractEvidence, { sessionId, contractId: "REQ-1", phase: "red", command: "./gradlew test", exitCode: 1 });
    const contractOk = await call(handleSugoPlan, { action: "contract_done", sessionId });
    expect(contractOk.data.state).toBe("CODE_READY");
    await call(handleSugoPlan, { action: "code_start", sessionId });

    // (게이트 5) analyze 호출강제: 미호출이면 code_done 거부
    const noAnalyze = await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [WIRING_FILE] });
    expect(noAnalyze.data.errorCode).toBe("ANALYZE_NOT_CALLED");
    await call(handleSugoAnalyze, { sessionId, changedFiles: [WIRING_FILE] });

    // (게이트 6) wiring: 배선파일 변경인데 wiringTestAdded 없으면 거부
    const noWiring = await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [WIRING_FILE] });
    expect(noWiring.data.errorCode).toBe("WIRING_TEST_MISSING");

    // (게이트 7) registration-glue: dependencyRemoved인데 미점검이면 거부
    const noGlue = await call(handleSugoPlan, {
      action: "code_done", sessionId, changedFiles: [WIRING_FILE],
      wiringTestAdded: true, dependencyRemoved: true,
    });
    expect(noGlue.data.errorCode).toBe("REGISTRATION_GLUE_NOT_CHECKED");

    // (게이트 8) boot: 부팅 가능 스택인데 @SpringBootTest 없으면 거부 → 어노테이션 추가하면 통과
    const noBoot = await call(handleSugoPlan, {
      action: "code_done", sessionId, changedFiles: [WIRING_FILE],
      wiringTestAdded: true, dependencyRemoved: true, registrationGlueChecked: true,
    });
    expect(noBoot.data.errorCode).toBe("BOOT_GATE_FAILED");
    writeSpringBootTestAnnotation();
    const codeDone = await call(handleSugoPlan, {
      action: "code_done", sessionId, changedFiles: [WIRING_FILE],
      wiringTestAdded: true, dependencyRemoved: true, registrationGlueChecked: true,
    });
    expect(codeDone.isError).toBe(false);
    expect(codeDone.data.state).toBe("CODE_DONE");

    // (게이트 9) test-evidence: 기록 없이 test_done 주장하면 거부 → 풀검증 증거 기록하면 통과
    await call(handleSugoPlan, { action: "test_start", sessionId });
    const noEvidence = await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });
    expect(noEvidence.data.errorCode).toBe("TEST_EVIDENCE_MISSING");
    await call(handleSugoRecordTestEvidence, { sessionId, command: "./gradlew check", exitCode: 0, failed: 0 });

    // (게이트 10) coverage: coverageMap이 미충족이면 test_done 거부 → 충족하면 통과(§10, test_done에 배선)
    const badCoverage = await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true, coverageMap: INCOMPLETE_COVERAGE });
    expect(badCoverage.data.errorCode).toBe("PRD_COVERAGE_INCOMPLETE");
    const testDone = await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true, coverageMap: FULL_COVERAGE });
    expect(testDone.data.state).toBe("TEST_DONE");
    await call(handleSugoPlan, { action: "review_start", sessionId });
    await call(handleSugoValidate, { sessionId: sessionId, validationResults: [] }); // VALIDATE_NOT_CALLED 게이트 충족용
    await call(handleSugoCheckLethalTrifecta, { sessionId: sessionId, tools: [] }); // LETHAL_TRIFECTA_NOT_CALLED 게이트 충족용

    // (게이트 11) user-confirmation: 확인 없으면 거부 (review_done 순서: confirm→summary→runtime→contract)
    const noConfirm = await call(handleSugoPlan, {
      action: "review_done", sessionId, userConfirmed: false, summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true, wiringVerified: true },
    });
    expect(noConfirm.data.errorCode).toBe("USER_CONFIRMATION_REQUIRED");

    // (게이트 12) runtime-verification: runtimeVerified:false면 거부
    const noRuntime = await call(handleSugoPlan, {
      action: "review_done", sessionId, userConfirmed: true, summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: false },
    });
    expect(noRuntime.isError).toBe(true);
    expect(noRuntime.data.errorCode).toMatch(/^RUNTIME_/);

    // (게이트 13) contract-evidence: red만 있고 green 없으면 거부 → green 기록하면 통과
    const noGreen = await call(handleSugoPlan, {
      action: "review_done", sessionId, userConfirmed: true, summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true, wiringVerified: true },
    });
    expect(noGreen.data.errorCode).toBe("CONTRACT_EVIDENCE_INCOMPLETE");
    await call(handleSugoRecordContractEvidence, { sessionId, contractId: "REQ-1", phase: "green", command: "./gradlew check", exitCode: 0 });
    const reviewDone = await call(handleSugoPlan, {
      action: "review_done", sessionId, userConfirmed: true, summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true, wiringVerified: true },
    });
    expect(reviewDone.isError).toBe(false);
    expect(reviewDone.data.state).toBe("DOCS_PENDING");

    // docs → commit: DONE 도달 + 우회라벨 0개이므로 완료등급 verified
    await call(handleSugoPlan, { action: "docs_done", sessionId });
    const commit = await call(handleSugoPlan, { action: "commit", sessionId });
    expect(commit.isError).toBe(false);
    expect(commit.data.state).toBe("DONE");
    expect(commit.data.completionGrade).toBe("verified");
  });
});

describe("patch 파이프라인 — 완주 + wiring 게이트 자동 트리거(§7)", () => {
  async function firstRoundToReviewDone(): Promise<string> {
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
    const sessionId = start.data.sessionId as string;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    await call(handleSugoPlan, { action: "prd", sessionId, prdContent: PLAIN_PRD });
    await call(handleSugoPlan, { action: "ready", sessionId });
    await call(handleSugoPlan, { action: "baseline_capture", sessionId });
    await call(handleSugoPlan, { action: "contract_start", sessionId });
    await call(handleSugoPlan, { action: "contract_done", sessionId });
    await call(handleSugoPlan, { action: "code_start", sessionId });
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
    await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [] });
    await call(handleSugoPlan, { action: "test_start", sessionId });
    await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 0, failed: 0 });
    await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });
    await call(handleSugoPlan, { action: "review_start", sessionId });
    await call(handleSugoValidate, { sessionId: sessionId, validationResults: [] }); // VALIDATE_NOT_CALLED 게이트 충족용
    await call(handleSugoCheckLethalTrifecta, { sessionId: sessionId, tools: [] }); // LETHAL_TRIFECTA_NOT_CALLED 게이트 충족용
    const rd = await call(handleSugoPlan, {
      action: "review_done", sessionId, userConfirmed: true, summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    return rd.data.workResultPath as string;
  }

  it("1차 산출물로 patch 진입 → 배선변경 없어도 wiring 게이트가 자동 트리거되고, 충족하면 DONE까지 간다", async () => {
    const workResultPath = await firstRoundToReviewDone();

    // patch 진입: data.patch.version=2로 표시된다
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login-patch", workResultPath });
    const sessionId = start.data.sessionId as string;
    expect(start.data.patch.version).toBe(1);
    await call(handleSugoPlan, { action: "clarify", sessionId });
    await call(handleSugoPlan, { action: "prd", sessionId, prdContent: PLAIN_PRD });
    await call(handleSugoPlan, { action: "ready", sessionId });
    await call(handleSugoPlan, { action: "baseline_capture", sessionId });
    await call(handleSugoPlan, { action: "contract_start", sessionId });
    await call(handleSugoPlan, { action: "contract_done", sessionId });
    await call(handleSugoPlan, { action: "code_start", sessionId });
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });

    // patch 모드는 changedFiles가 비어도 wiring 게이트가 자동 트리거된다
    const noWiring = await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [] });
    expect(noWiring.data.errorCode).toBe("WIRING_TEST_MISSING");
    const codeDone = await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [], wiringTestAdded: true });
    expect(codeDone.data.state).toBe("CODE_DONE");

    await call(handleSugoPlan, { action: "test_start", sessionId });
    await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 0, failed: 0 });
    await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });
    await call(handleSugoPlan, { action: "review_start", sessionId });
    await call(handleSugoValidate, { sessionId: sessionId, validationResults: [] }); // VALIDATE_NOT_CALLED 게이트 충족용
    await call(handleSugoCheckLethalTrifecta, { sessionId: sessionId, tools: [] }); // LETHAL_TRIFECTA_NOT_CALLED 게이트 충족용
    await call(handleSugoPlan, {
      action: "review_done", sessionId, userConfirmed: true, summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    await call(handleSugoPlan, { action: "docs_done", sessionId });
    const commit = await call(handleSugoPlan, { action: "commit", sessionId });
    expect(commit.data.state).toBe("DONE");
  });
});

describe("label-guard 관통 + 완료등급", () => {
  it("그린 증거가 이미 있는데 환경부재 라벨을 주장하면 LABEL_CONTRADICTION으로 거부한다", async () => {
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
    const sessionId = start.data.sessionId as string;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    await call(handleSugoPlan, { action: "prd", sessionId, prdContent: SIGNAL_PRD });
    await call(handleSugoPlan, { action: "ready", sessionId });
    await call(handleSugoRecordTestEvidence, { sessionId, kind: "baseline", command: "./gradlew test", exitCode: 0, failed: 0 });
    await call(handleSugoPlan, { action: "baseline_capture", sessionId });
    await call(handleSugoPlan, { action: "contract_start", sessionId });
    // 그린 baseline 증거가 있는데 contract를 환경부재로 우회 주장 → 모순
    const contradiction = await call(handleSugoPlan, { action: "contract_done", sessionId, contractEnvironmentAbsentReason: "CI 없음" });
    expect(contradiction.isError).toBe(true);
    expect(contradiction.data.errorCode).toBe("LABEL_CONTRADICTION");
  });

  it("우회 라벨(bootUnverifiedReason)로 통과하면 commit에서 완료등급이 unverified로 강등된다", async () => {
    await markSpringBoot(); // bootable, @SpringBootTest 없음
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
    const sessionId = start.data.sessionId as string;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    await call(handleSugoPlan, { action: "prd", sessionId, prdContent: PLAIN_PRD }); // baseline 시그널 없음 → 그린 증거 없음
    await call(handleSugoPlan, { action: "ready", sessionId });
    await call(handleSugoPlan, { action: "baseline_capture", sessionId });
    await call(handleSugoPlan, { action: "contract_start", sessionId });
    await call(handleSugoPlan, { action: "contract_done", sessionId });
    await call(handleSugoPlan, { action: "code_start", sessionId });
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
    // boot 게이트를 우회 라벨로 통과(그린 증거 없어 모순 아님)
    const codeDone = await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [], bootUnverifiedReason: "로컬에 Spring 부팅 환경 없음" });
    expect(codeDone.data.state).toBe("CODE_DONE");
    await call(handleSugoPlan, { action: "test_start", sessionId });
    await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 0, failed: 0 });
    await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });
    await call(handleSugoPlan, { action: "review_start", sessionId });
    await call(handleSugoValidate, { sessionId: sessionId, validationResults: [] }); // VALIDATE_NOT_CALLED 게이트 충족용
    await call(handleSugoCheckLethalTrifecta, { sessionId: sessionId, tools: [] }); // LETHAL_TRIFECTA_NOT_CALLED 게이트 충족용
    await call(handleSugoPlan, {
      action: "review_done", sessionId, userConfirmed: true, summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true, wiringVerified: true },
    });
    await call(handleSugoPlan, { action: "docs_done", sessionId });
    const commit = await call(handleSugoPlan, { action: "commit", sessionId });
    expect(commit.data.state).toBe("DONE"); // 차단은 아님
    expect(commit.data.completionGrade).toBe("unverified"); // 등급 강등
  });
});
