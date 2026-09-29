import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveProjectConfig } from "../src/harness/config.js";
import { handleSugoAdd } from "../src/tools/sugoAdd.js";
import { handleSugoAnalyze } from "../src/tools/sugoAnalyze.js";
import { handleSugoCheckLethalTrifecta } from "../src/tools/sugoCheckLethalTrifecta.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";
import { handleSugoRecordTestEvidence } from "../src/tools/sugoRecordTestEvidence.js";
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

let fakeHome: string;
let projectDir: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-rd-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "sugo-rd-project-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

/** start~test_done(그린)까지 몰아서 REVIEW_RUNNING 직전(TEST_DONE)까지 도달시킨다. */
async function toTestDone(
  testPassed = true,
  failed = 0,
  skipAutoValidate = false,
  skipAutoTrifecta = false,
): Promise<string> {
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
  await call(handleSugoRecordTestEvidence, {
    sessionId,
    command: "npm test",
    exitCode: testPassed ? 0 : 1,
    failed,
  });
  await call(handleSugoPlan, { action: "test_done", sessionId, testPassed });
  await call(handleSugoPlan, { action: "review_start", sessionId });
  if (!skipAutoValidate) {
    // review_done의 VALIDATE_NOT_CALLED 게이트 충족용(§4.3 확장). 하네스 미적용 프로젝트라
    // validationResults가 비어 있어도 verifiedFailures 없이 통과한다.
    await call(handleSugoValidate, { sessionId, validationResults: [] });
  }
  if (!skipAutoTrifecta) {
    // review_done의 LETHAL_TRIFECTA_NOT_CALLED 게이트 충족용(§P6-1). 빈 tools면 경고 없이 통과한다.
    await call(handleSugoCheckLethalTrifecta, { sessionId, tools: [] });
  }
  return sessionId;
}

describe("review_done — 사용자확인 게이트", () => {
  it("userConfirmed 없이 호출하면 거부한다", async () => {
    const sessionId = await toTestDone();
    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("USER_CONFIRMATION_REQUIRED");
  });
});

describe("review_done — summary 품질 게이트", () => {
  it("summary가 저품질(패딩)이면 거부한다", async () => {
    const sessionId = await toTestDone();
    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: "aaaa\nbbbb\ncccc",
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toMatch(/^SUMMARY_/);
  });
});

describe("review_done — 런타임검증 게이트", () => {
  it("runtimeVerified:false + 라벨 없음이면 거부한다", async () => {
    const sessionId = await toTestDone();
    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: false, testRun: false, runtimeVerified: false },
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("RUNTIME_UNVERIFIED_GATE_FAILED");
  });

  it("testPassedState=fail인데 runtimeVerified:true 주장이면 거부한다", async () => {
    const sessionId = await toTestDone(false, 3);
    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("RUNTIME_CLAIM_CONTRADICTS_EVIDENCE");
  });

  it("부팅 가능 스택인데 wiringVerified 없으면 거부한다", async () => {
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
    const sessionId = await toTestDone();
    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("RUNTIME_WIRING_NOT_VERIFIED");
  });

  it("환경부재 라벨로 우회할 수 있다", async () => {
    // §4.6 label-guard: 그린 test evidence가 있는 채로 환경부재를 주장하면 라벨-모순으로 거부되므로,
    // 이 세션은 test evidence부터 그린이 아니어야 한다(일관되게 "환경이 없었다"는 이야기).
    const sessionId = await toTestDone(false, 3);
    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: {
        buildAttempted: false,
        testRun: false,
        runtimeVerified: false,
        unverifiedReason: "샌드박스에 런타임 없음",
      },
    });
    expect(result.isError).toBe(false);
  });
});

describe("review_done — 3중게이트 모두 통과", () => {
  it("DOCS_PENDING으로 전이하고 work-result.md를 저장하며 인간공수 추정치를 반환한다", async () => {
    const sessionId = await toTestDone();
    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    expect(result.isError).toBe(false);
    expect(result.data.state).toBe("DOCS_PENDING");
    expect(result.data.humanHoursEstimate).toBeDefined();
    expect(result.data.humanHoursEstimate.estimatedHumanHours).toBeGreaterThanOrEqual(0);

    const workResultPath = join(projectDir, "sugo", "features");
    expect(existsSync(workResultPath)).toBe(true);

    // 실제 파일 내용까지 확인
    const status = await call(handleSugoPlan, { action: "status", sessionId });
    expect(status.data.state).toBe("DOCS_PENDING");
  });

  it("docs_done → commit까지 이어져 DONE에 도달한다(순서강제 회귀 확인)", async () => {
    const sessionId = await toTestDone();
    await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    await call(handleSugoPlan, { action: "docs_done", sessionId });
    const commit = await call(handleSugoPlan, { action: "commit", sessionId });
    expect(commit.isError).toBe(false);
    expect(commit.data.state).toBe("DONE");
  });
});

describe("work-result.md 파일 내용 검증", () => {
  it("작성한 summary와 실행 증거가 표준 work-result 골격으로 저장된다", async () => {
    const sessionId = await toTestDone();
    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });

    const workResultPath = result.data.workResultPath as string;
    expect(existsSync(workResultPath)).toBe(true);
    const content = readFileSync(workResultPath, "utf-8");
    expect(content).toContain("# Work Result — login");
    expect(content).toContain("## 결과 요약");
    expect(content).toContain(GOOD_SUMMARY);
    expect(content).toContain("## 주요 변경");
    expect(content).toContain("## 검증");
    expect(content).toContain("`npm test`");
    expect(content).toContain("## 남은 사항 및 위험");
  });
});

describe("review_done — sugo_validate 호출강제 + 실측 우선 게이트(실배선)", () => {
  it("sugo_validate를 한 번도 안 부르면 review_done이 거부된다", async () => {
    const sessionId = await toTestDone(true, 0, /* skipAutoValidate */ true);
    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("VALIDATE_NOT_CALLED");
  });

  it("실제로 auto 체크를 위반한 프로젝트는 통과했다고 주장해도 review_done이 거부된다", async () => {
    // strict:false는 lang/typescript의 no-weakened-strict-config(error, auto)를 실제로 위반한다.
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ devDependencies: { typescript: "^5.4.0" } }));
    writeFileSync(join(projectDir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: false } }));
    await call(handleSugoAdd, { projectPath: projectDir });

    const sessionId = await toTestDone(true, 0, /* skipAutoValidate */ true);
    const validate = await call(handleSugoValidate, {
      sessionId,
      validationResults: [{ harnessId: "lang/typescript", checkId: "no-weakened-strict-config", passed: true }],
    });
    expect(validate.data.verdict).toBe("fail"); // 주장은 true지만 실측이 뒤집는다

    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("VALIDATE_VERIFIED_FAILURE");
    expect(result.data.message).toContain("no-weakened-strict-config");
  });

  it("실측이 전부 통과면 review_done이 정상 진행된다", async () => {
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ devDependencies: { typescript: "^5.4.0" } }));
    writeFileSync(join(projectDir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, moduleResolution: "bundler" } }));
    await call(handleSugoAdd, { projectPath: projectDir });

    const sessionId = await toTestDone(true, 0, /* skipAutoValidate */ true);
    await call(handleSugoValidate, { sessionId, validationResults: [] });

    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    expect(result.isError).toBe(false);
  });
});

describe("review_done — sugo_check_lethal_trifecta 호출강제 + 완화사유 게이트(§P6-1, 실배선)", () => {
  it("sugo_check_lethal_trifecta를 한 번도 안 부르면 review_done이 거부된다", async () => {
    const sessionId = await toTestDone(true, 0, /* skipAutoValidate */ false, /* skipAutoTrifecta */ true);
    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("LETHAL_TRIFECTA_NOT_CALLED");
  });

  it("3축이 모두 성립하는 도구를 보고했는데 완화사유 없이 review_done을 부르면 거부한다", async () => {
    const sessionId = await toTestDone(true, 0, /* skipAutoValidate */ false, /* skipAutoTrifecta */ true);
    const trifecta = await call(handleSugoCheckLethalTrifecta, {
      sessionId,
      tools: [{ toolName: "web-fetch-and-read-secrets", accessesPrivateData: true, processesUntrustedInput: true, communicatesExternally: true }],
    });
    expect(trifecta.data.safe).toBe(false);

    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("LETHAL_TRIFECTA_MITIGATION_REQUIRED");
    expect(result.data.message).toContain("web-fetch-and-read-secrets");
  });

  it("경고가 있어도 trifectaMitigation을 함께 제출하면 review_done이 통과한다", async () => {
    const sessionId = await toTestDone(true, 0, /* skipAutoValidate */ false, /* skipAutoTrifecta */ true);
    await call(handleSugoCheckLethalTrifecta, {
      sessionId,
      tools: [{ toolName: "web-fetch-and-read-secrets", accessesPrivateData: true, processesUntrustedInput: true, communicatesExternally: true }],
    });

    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      trifectaMitigation: "sub-agent로 격리하고 외부 통신 capability를 제거했다",
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    expect(result.isError).toBe(false);
  });

  it("경고가 없으면 완화사유 없이도 review_done이 통과한다", async () => {
    const sessionId = await toTestDone(true, 0, /* skipAutoValidate */ false, /* skipAutoTrifecta */ true);
    await call(handleSugoCheckLethalTrifecta, {
      sessionId,
      tools: [{ toolName: "pure-calculator", accessesPrivateData: false, processesUntrustedInput: false, communicatesExternally: false }],
    });

    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    expect(result.isError).toBe(false);
  });
});
