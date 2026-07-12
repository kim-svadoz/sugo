import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoAdd } from "../src/tools/sugoAdd.js";
import { handleSugoAnalyze } from "../src/tools/sugoAnalyze.js";
import { handleSugoChain } from "../src/tools/sugoChain.js";
import { handleSugoGetProjectContext } from "../src/tools/sugoGetProjectContext.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";
import { handleSugoRecordTestEvidence } from "../src/tools/sugoRecordTestEvidence.js";
import { handleSugoValidate } from "../src/tools/sugoValidate.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(handler: (args: unknown) => Promise<any>, args: unknown) {
  const res = await handler(args);
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

const VALID_PRD = "REQ-1: 이메일 로그인 기능을 제공한다. " + "가".repeat(90);

let fakeHome: string;
let projectDir: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-chain-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "sugo-chain-project-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

async function toCodeDone(): Promise<string> {
  const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
  const sessionId = start.data.sessionId as string;
  await call(handleSugoPlan, { action: "clarify", sessionId });
  await call(handleSugoPlan, { action: "prd", sessionId, prdContent: VALID_PRD });
  await call(handleSugoPlan, { action: "ready", sessionId });
  await call(handleSugoPlan, { action: "code_start", sessionId });
  await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
  await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: ["login.js"] });
  return sessionId;
}

describe("sugo_chain — 세션 상태에 따른 방향 판단", () => {
  it("CODE_DONE 상태면 code_to_test 핸드오프를 만든다", async () => {
    const sessionId = await toCodeDone();
    const result = await call(handleSugoChain, { sessionId, changeType: "feature", summary: "이메일 로그인 구현" });
    expect(result.isError).toBe(false);
    expect(result.data.direction).toBe("code_to_test");
    expect(result.data.handoff.changedFiles).toEqual(["login.js"]);
    expect(result.data.prompt).toContain("test-agent");
  });

  it("TEST_DONE 상태면 test_to_review 핸드오프를 만든다", async () => {
    const sessionId = await toCodeDone();
    await call(handleSugoPlan, { action: "test_start", sessionId });
    await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 0, failed: 0 });
    await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });

    const result = await call(handleSugoChain, { sessionId, changeType: "feature", summary: "테스트 통과" });
    expect(result.isError).toBe(false);
    expect(result.data.direction).toBe("test_to_review");
    expect(result.data.prompt).toContain("읽기 전용");
  });

  it("잘못된 상태(SCAN)에서 호출하면 거부한다", async () => {
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "x" });
    const result = await call(handleSugoChain, { sessionId: start.data.sessionId, changeType: "feature", summary: "x" });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("CHAIN_WRONG_STATE");
  });

  it("호출 이력이 세션에 감사로그로 남는다(하드게이트는 아님)", async () => {
    const sessionId = await toCodeDone();
    await call(handleSugoChain, { sessionId, changeType: "feature", summary: "1차" });
    const status1 = await call(handleSugoPlan, { action: "status", sessionId });
    expect(status1.data.state).toBe("CODE_DONE");
    // test_start로 넘어가는 데 sugo_chain 호출 자체는 필수가 아님(현재 스코프 결정)
    const testStart = await call(handleSugoPlan, { action: "test_start", sessionId });
    expect(testStart.isError).toBe(false);
  });
});

describe("sugo_get_project_context", () => {
  it("등록되지 않은 프로젝트는 registered:false를 반환한다", async () => {
    const result = await call(handleSugoGetProjectContext, { projectPath: projectDir });
    expect(result.data.registered).toBe(false);
    expect(result.data.claudeMd).toBeNull();
    expect(result.data.harnesses).toEqual([]);
  });

  it("sugo_add 이후에는 CLAUDE.md와 적용된 하네스 본문을 반환한다", async () => {
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ dependencies: { react: "^18.0.0" } }));
    writeFileSync(join(projectDir, "tsconfig.json"), "{}");
    await call(handleSugoAdd, { projectPath: projectDir });

    const result = await call(handleSugoGetProjectContext, { projectPath: projectDir });
    expect(result.data.registered).toBe(true);
    expect(result.data.claudeMd).toContain("Sugo 하네스 인덱스");
    expect(result.data.harnesses.length).toBeGreaterThan(0);
    expect(result.data.harnesses.some((h: { id: string }) => h.id === "lang/typescript")).toBe(true);
  });

  it(".claude/rules/*.md가 있으면 함께 반환한다", async () => {
    mkdirSync(join(projectDir, ".claude", "rules"), { recursive: true });
    writeFileSync(join(projectDir, ".claude", "rules", "custom.md"), "# 팀 전용 규칙");
    const result = await call(handleSugoGetProjectContext, { projectPath: projectDir });
    expect(result.data.rules.length).toBe(1);
    expect(result.data.rules[0].content).toContain("팀 전용 규칙");
  });
});

describe("sugo_validate", () => {
  it("sugo_add로 생성된 실제 validation.yaml과 대조해 정상 판정한다", async () => {
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ dependencies: { react: "^18.0.0" } }));
    writeFileSync(join(projectDir, "tsconfig.json"), "{}");
    await call(handleSugoAdd, { projectPath: projectDir });

    const sessionId = await toCodeDone();
    const result = await call(handleSugoValidate, {
      sessionId,
      validationResults: [{ harnessId: "lang/typescript", checkId: "strict-mode", passed: true }],
    });
    expect(result.isError).toBe(false);
    expect(result.data.verdict).toBe("pass");
    expect(result.data.fabricated).toEqual([]);
  });

  it("존재하지 않는 checkId를 보고하면 fabricated로 분리되고 세션에 기록된다", async () => {
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ dependencies: { react: "^18.0.0" } }));
    writeFileSync(join(projectDir, "tsconfig.json"), "{}");
    await call(handleSugoAdd, { projectPath: projectDir });

    const sessionId = await toCodeDone();
    const result = await call(handleSugoValidate, {
      sessionId,
      validationResults: [{ harnessId: "lang/typescript", checkId: "존재하지-않음", passed: true }],
    });
    expect(result.data.fabricated.length).toBe(1);

    const status = await call(handleSugoPlan, { action: "status", sessionId });
    expect(status.data.state).toBe("CODE_DONE");
  });
});
