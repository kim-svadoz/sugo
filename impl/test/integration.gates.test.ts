import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { saveProjectConfig } from "../src/harness/config.js";
import { handleSugoAnalyze } from "../src/tools/sugoAnalyze.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";
import { handleSugoRecordTestEvidence } from "../src/tools/sugoRecordTestEvidence.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(handler: (args: unknown) => Promise<any>, args: unknown) {
  const res = await handler(args);
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

const VALID_PRD = "REQ-1: 이메일 로그인 기능을 제공한다. " + "가".repeat(90);
const BASELINE_SIGNAL_PRD = "REQ-1: JDK 버전을 상향한다. " + "가".repeat(90);

let fakeHome: string;
let projectDir: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-int-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "sugo-int-project-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

async function startToReady(prdContent: string): Promise<string> {
  const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
  const sessionId = start.data.sessionId as string;
  await call(handleSugoPlan, { action: "clarify", sessionId });
  const prd = await call(handleSugoPlan, { action: "prd", sessionId, prdContent });
  expect(prd.isError).toBe(false);
  await call(handleSugoPlan, { action: "ready", sessionId });
  await call(handleSugoPlan, { action: "code_start", sessionId });
  return sessionId;
}

describe("PRD 콘텐츠 게이트", () => {
  it("100자 미만 PRD는 거부되고 CLARIFY에 머문다", async () => {
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "x" });
    const sessionId = start.data.sessionId as string;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    const prd = await call(handleSugoPlan, { action: "prd", sessionId, prdContent: "짧은 PRD" });
    expect(prd.isError).toBe(true);
    expect(prd.data.errorCode).toBe("PRD_TOO_SHORT");

    const status = await call(handleSugoPlan, { action: "status", sessionId });
    expect(status.data.state).toBe("CLARIFY");
  });
});

describe("analyze 호출강제 게이트 (§4.1)", () => {
  it("sugo_analyze를 호출하지 않고 code_done을 부르면 ANALYZE_NOT_CALLED로 거부된다", async () => {
    const sessionId = await startToReady(VALID_PRD);
    const codeDone = await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [] });
    expect(codeDone.isError).toBe(true);
    expect(codeDone.data.errorCode).toBe("ANALYZE_NOT_CALLED");
  });

  it("sugo_analyze를 1회 호출하면(verdict 무관) code_done이 통과한다", async () => {
    const sessionId = await startToReady(VALID_PRD);
    writeFileSync(join(projectDir, "login.js"), "function emailLogin() {}");
    const analyze = await call(handleSugoAnalyze, { sessionId, changedFiles: ["login.js"] });
    expect(analyze.isError).toBe(false);
    expect(analyze.data.attempt).toBe(1);

    const codeDone = await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: ["login.js"] });
    expect(codeDone.isError).toBe(false);
    expect(codeDone.data.state).toBe("CODE_DONE");
  });
});

describe("baseline 게이트 (§4.0)", () => {
  it("baseline 시그널이 있는 PRD는 baseline evidence 없이 code_done을 거부한다", async () => {
    const sessionId = await startToReady(BASELINE_SIGNAL_PRD);
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
    const codeDone = await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [] });
    expect(codeDone.isError).toBe(true);
    expect(codeDone.data.errorCode).toBe("BASELINE_NOT_GREEN");
  });

  it("baseline evidence를 그린으로 기록하면 code_done이 통과한다", async () => {
    const sessionId = await startToReady(BASELINE_SIGNAL_PRD);
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
    await call(handleSugoRecordTestEvidence, {
      sessionId,
      kind: "baseline",
      command: "./gradlew test",
      exitCode: 0,
      failed: 0,
    });
    const codeDone = await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [] });
    expect(codeDone.isError).toBe(false);
  });

  it("시그널 없는 PRD는 baseline 증거 없이도 통과한다(no-op)", async () => {
    const sessionId = await startToReady(VALID_PRD);
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
    const codeDone = await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [] });
    expect(codeDone.isError).toBe(false);
  });
});

describe("wiring 게이트 (§4.1)", () => {
  it("application.yml 변경 + wiringTestAdded 없음이면 거부한다", async () => {
    const sessionId = await startToReady(VALID_PRD);
    await call(handleSugoAnalyze, { sessionId, changedFiles: ["application.yml"] });
    const codeDone = await call(handleSugoPlan, {
      action: "code_done",
      sessionId,
      changedFiles: ["application.yml"],
    });
    expect(codeDone.isError).toBe(true);
    expect(codeDone.data.errorCode).toBe("WIRING_TEST_MISSING");
  });

  it("wiringTestAdded:true면 통과한다", async () => {
    const sessionId = await startToReady(VALID_PRD);
    await call(handleSugoAnalyze, { sessionId, changedFiles: ["application.yml"] });
    const codeDone = await call(handleSugoPlan, {
      action: "code_done",
      sessionId,
      changedFiles: ["application.yml"],
      wiringTestAdded: true,
    });
    expect(codeDone.isError).toBe(false);
  });
});

describe("registration-glue 게이트 (§4.1)", () => {
  it("dependencyRemoved:true인데 미점검이면 거부한다", async () => {
    const sessionId = await startToReady(VALID_PRD);
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
    const codeDone = await call(handleSugoPlan, {
      action: "code_done",
      sessionId,
      changedFiles: [],
      dependencyRemoved: true,
    });
    expect(codeDone.isError).toBe(true);
    expect(codeDone.data.errorCode).toBe("REGISTRATION_GLUE_NOT_CHECKED");
  });
});

describe("boot 게이트 (§4.1) — Spring Boot 프로젝트", () => {
  async function markProjectAsSpringBoot() {
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

  it("부팅 가능 스택인데 @SpringBootTest가 없으면 거부한다", async () => {
    await markProjectAsSpringBoot();
    const sessionId = await startToReady(VALID_PRD);
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
    const codeDone = await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [] });
    expect(codeDone.isError).toBe(true);
    expect(codeDone.data.errorCode).toBe("BOOT_GATE_FAILED");
  });

  it("실제 @SpringBootTest 어노테이션이 있으면 통과한다", async () => {
    await markProjectAsSpringBoot();
    mkdirSync(join(projectDir, "src", "test", "java"), { recursive: true });
    writeFileSync(
      join(projectDir, "src", "test", "java", "AppContextLoadTest.java"),
      "package com.demo;\n\n@SpringBootTest\nclass AppContextLoadTest {}\n",
    );
    const sessionId = await startToReady(VALID_PRD);
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
    const codeDone = await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [] });
    expect(codeDone.isError).toBe(false);
  });

  it("주석 속 @SpringBootTest만 있으면 여전히 거부한다(거짓 그린 방지)", async () => {
    await markProjectAsSpringBoot();
    mkdirSync(join(projectDir, "src", "test", "java"), { recursive: true });
    writeFileSync(
      join(projectDir, "src", "test", "java", "FakeTest.java"),
      "package com.demo;\n\n// @SpringBootTest\nclass FakeTest {}\n",
    );
    const sessionId = await startToReady(VALID_PRD);
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
    const codeDone = await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [] });
    expect(codeDone.isError).toBe(true);
    expect(codeDone.data.errorCode).toBe("BOOT_GATE_FAILED");
  });

  it("bootUnverifiedReason 라벨로 우회할 수 있다", async () => {
    await markProjectAsSpringBoot();
    const sessionId = await startToReady(VALID_PRD);
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
    const codeDone = await call(handleSugoPlan, {
      action: "code_done",
      sessionId,
      changedFiles: [],
      bootUnverifiedReason: "샌드박스에 JDK 미설치",
    });
    expect(codeDone.isError).toBe(false);
  });
});

describe("test 증거대조 게이트 (§4.2)", () => {
  async function toCodeDone(): Promise<string> {
    const sessionId = await startToReady(VALID_PRD);
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
    await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [] });
    await call(handleSugoPlan, { action: "test_start", sessionId });
    return sessionId;
  }

  it("증거 기록 없이 testPassed:true 주장하면 거부한다", async () => {
    const sessionId = await toCodeDone();
    const testDone = await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });
    expect(testDone.isError).toBe(true);
    expect(testDone.data.errorCode).toBe("TEST_EVIDENCE_MISSING");
  });

  it("기록이 실패(failed>0)인데 testPassed:true 주장하면 거부한다", async () => {
    const sessionId = await toCodeDone();
    await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 1, failed: 3 });
    const testDone = await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });
    expect(testDone.isError).toBe(true);
    expect(testDone.data.errorCode).toBe("TEST_EVIDENCE_MISMATCH");
  });

  it("기록과 주장이 일치하면 통과하고 세션에 testPassedState가 남는다", async () => {
    const sessionId = await toCodeDone();
    await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 0, failed: 0 });
    const testDone = await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });
    expect(testDone.isError).toBe(false);
    expect(testDone.data.state).toBe("TEST_DONE");

    const status = await call(handleSugoPlan, { action: "status", sessionId });
    expect(status.data.state).toBe("TEST_DONE");
  });
});
