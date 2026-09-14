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
  await call(handleSugoPlan, { action: "baseline_capture", sessionId });
  await call(handleSugoPlan, { action: "contract_start", sessionId });
  await call(handleSugoPlan, { action: "contract_done", sessionId });
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

  it("changedFiles를 주면 그 파일에 해당하는 하네스만 싣는다(폴리글랏 실배선)", async () => {
    // Java(Spring/Maven) + TypeScript(React/npm)가 한 저장소에 있는 상태를 실제로 만든다.
    writeFileSync(
      join(projectDir, "package.json"),
      JSON.stringify({ dependencies: { react: "^19.0.0" } }),
    );
    writeFileSync(join(projectDir, "tsconfig.json"), "{}");
    writeFileSync(join(projectDir, "package-lock.json"), "{}");
    writeFileSync(
      join(projectDir, "pom.xml"),
      `<project>
        <properties><java.version>21</java.version></properties>
        <parent><artifactId>spring-boot-starter-parent</artifactId><version>3.2.4</version></parent>
      </project>`,
    );
    await call(handleSugoAdd, { projectPath: projectDir });

    const all = await call(handleSugoGetProjectContext, { projectPath: projectDir });
    const allIds = all.data.harnesses.map((h: { id: string }) => h.id);
    expect(allIds).toContain("lang/java/21");
    expect(allIds).toContain("framework/react/19.x");

    const javaOnly = await call(handleSugoGetProjectContext, {
      projectPath: projectDir,
      changedFiles: ["src/main/java/com/acme/UserService.java"],
    });
    const javaIds = javaOnly.data.harnesses.map((h: { id: string }) => h.id);
    expect(javaIds).toContain("lang/java");
    expect(javaIds).toContain("lang/java/21");
    expect(javaIds).toContain("framework/spring/3.x");
    expect(javaIds).toContain("default"); // 바닥 규칙은 항상
    expect(javaIds).not.toContain("framework/react/19.x");
    expect(javaIds).not.toContain("lang/typescript");
    expect(javaOnly.data.harnessRouting.fellBackToAll).toBe(false);
    expect(javaOnly.data.harnessRouting.excluded).toContain("lang/typescript");
  });

  it("인식 못 하는 파일만 주면 좁히지 않고 전량을 싣는다", async () => {
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ dependencies: { react: "^19.0.0" } }));
    writeFileSync(join(projectDir, "tsconfig.json"), "{}");
    await call(handleSugoAdd, { projectPath: projectDir });

    const result = await call(handleSugoGetProjectContext, {
      projectPath: projectDir,
      changedFiles: ["README.md"],
    });
    expect(result.data.harnessRouting.fellBackToAll).toBe(true);
    expect(result.data.harnessRouting.excluded).toEqual([]);
    expect(result.data.harnesses.map((h: { id: string }) => h.id)).toContain("lang/typescript");
  });
});

describe("sugo_validate", () => {
  it("sugo_add로 생성된 실제 validation.yaml과 대조해 정상 판정한다", async () => {
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ dependencies: { react: "^18.0.0" } }));
    // strict가 실제로 켜져 있어야 auto 체크(no-weakened-strict-config)가 통과한다.
    writeFileSync(join(projectDir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true } }));
    await call(handleSugoAdd, { projectPath: projectDir });

    const sessionId = await toCodeDone();
    const result = await call(handleSugoValidate, {
      sessionId,
      validationResults: [{ harnessId: "lang/typescript", checkId: "no-weakened-strict-config", passed: true }],
    });
    expect(result.isError).toBe(false);
    expect(result.data.verdict).toBe("pass");
    expect(result.data.fabricated).toEqual([]);
    expect(result.data.contradictions).toEqual([]);
    expect(result.data.autoVerifiedCount).toBeGreaterThan(0);
  });

  it("통과했다고 주장해도 서버 실측이 실패면 fail로 뒤집고 모순을 남긴다(실배선)", async () => {
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ dependencies: { react: "^18.0.0" } }));
    // strict를 꺼서 타입에러를 회피한 상태 — 하네스가 금지하는 바로 그 형태다.
    writeFileSync(join(projectDir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: false } }));
    await call(handleSugoAdd, { projectPath: projectDir });

    const sessionId = await toCodeDone();
    const result = await call(handleSugoValidate, {
      sessionId,
      validationResults: [{ harnessId: "lang/typescript", checkId: "no-weakened-strict-config", passed: true }],
    });

    expect(result.data.verdict).toBe("fail");
    const strictCheck = result.data.results.find(
      (r: { checkId: string }) => r.checkId === "no-weakened-strict-config",
    );
    expect(strictCheck.passed).toBe(false);
    expect(strictCheck.source).toBe("verified");
    expect(result.data.contradictions).toHaveLength(1);
    expect(result.data.contradictions[0].claimed).toBe(true);
    expect(result.data.contradictions[0].verified).toBe(false);
  });

  it("아무 것도 제출하지 않아도 auto 체크는 서버가 돌린다(실배선)", async () => {
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ dependencies: { react: "^18.0.0" } }));
    writeFileSync(join(projectDir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: false } }));
    await call(handleSugoAdd, { projectPath: projectDir });

    const sessionId = await toCodeDone();
    const result = await call(handleSugoValidate, { sessionId, validationResults: [] });

    // "제출 안 하면 자동 pass"가 auto 체크에는 성립하지 않는다.
    expect(result.data.verdict).toBe("fail");
    expect(result.data.uncoveredChecks.map((u: { checkId: string }) => u.checkId)).not.toContain(
      "no-weakened-strict-config",
    );
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
