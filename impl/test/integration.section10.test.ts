import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoAdd } from "../src/tools/sugoAdd.js";
import { handleSugoAnalyze } from "../src/tools/sugoAnalyze.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";
import { handleSugoRecordContractEvidence } from "../src/tools/sugoRecordContractEvidence.js";
import { handleSugoRecordTestEvidence } from "../src/tools/sugoRecordTestEvidence.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(handler: (args: unknown) => Promise<any>, args: unknown) {
  const res = await handler(args);
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

const VALID_PRD = "REQ-1: 이메일 로그인 기능을 제공한다. " + "가".repeat(90);
const TWO_REQ_PRD = "REQ-1: 이메일 로그인.\nREQ-2: 소셜 로그인.\n" + "가".repeat(90);
const GOOD_SUMMARY = [
  "배경: 사용자가 이메일로 로그인할 수 없는 문제가 있었다.",
  "변경: EmailLoginService를 추가하고 컨트롤러에 연결했다.",
  "설계: 기존 인증 흐름을 재사용하며 비밀번호 해시는 bcrypt를 사용했다.",
  "테스트: 단위테스트 12개와 통합테스트 2개를 추가해 전부 통과를 확인했다.",
].join("\n");

let fakeHome: string;
let projectDir: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-s10-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "sugo-s10-project-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

async function toTestDonePass(prd = VALID_PRD, changedFile = "login.ts"): Promise<string> {
  writeFileSync(join(projectDir, changedFile), "content");
  const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
  const sessionId = start.data.sessionId as string;
  await call(handleSugoPlan, { action: "clarify", sessionId });
  await call(handleSugoPlan, { action: "prd", sessionId, prdContent: prd });
  await call(handleSugoPlan, { action: "ready", sessionId });
  await call(handleSugoPlan, { action: "code_start", sessionId });
  await call(handleSugoAnalyze, { sessionId, changedFiles: [changedFile] });
  await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [changedFile] });
  await call(handleSugoPlan, { action: "test_start", sessionId });
  await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 0, failed: 0 });
  await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });
  await call(handleSugoPlan, { action: "review_start", sessionId });
  return sessionId;
}

describe("§10 이중 실행 제거 — reusedFromTestDone", () => {
  it("파일이 그대로면 runtimeCheck 없이 review_done이 통과한다", async () => {
    const sessionId = await toTestDonePass();
    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      reusedFromTestDone: true,
    });
    expect(result.isError).toBe(false);
    expect(result.data.state).toBe("DOCS_PENDING");
  });

  it("리뷰 중 파일이 수정되면(지문 불일치) 거부한다", async () => {
    const sessionId = await toTestDonePass(VALID_PRD, "login.ts");
    await new Promise((r) => setTimeout(r, 10));
    writeFileSync(join(projectDir, "login.ts"), "modified during review!!");

    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      reusedFromTestDone: true,
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("EVIDENCE_REUSE_FINGERPRINT_MISMATCH");
  });
});

describe("§10 계약테스트 실행증거 — opt-in", () => {
  it("opt-in 꺼져있으면(기본) 기록 없이도 review_done이 통과한다", async () => {
    const sessionId = await toTestDonePass();
    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    expect(result.isError).toBe(false);
  });

  it("opt-in 켜져있는데 기록이 없으면 거부한다", async () => {
    await call(handleSugoAdd, { projectPath: projectDir, contractEvidenceRequired: true });
    const sessionId = await toTestDonePass();
    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("CONTRACT_EVIDENCE_MISSING");
  });

  it("green만 기록하고 red가 없으면 거부한다(자기보고 승격 차단)", async () => {
    await call(handleSugoAdd, { projectPath: projectDir, contractEvidenceRequired: true });
    const sessionId = await toTestDonePass();
    await call(handleSugoRecordContractEvidence, { sessionId, contractId: "C-1", phase: "green", command: "x", exitCode: 0 });
    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("CONTRACT_EVIDENCE_INCOMPLETE");
  });

  it("red→green 전이를 실제로 기록하면 통과한다", async () => {
    await call(handleSugoAdd, { projectPath: projectDir, contractEvidenceRequired: true });
    const sessionId = await toTestDonePass();
    await call(handleSugoRecordContractEvidence, { sessionId, contractId: "C-1", phase: "red", command: "x", exitCode: 1 });
    await call(handleSugoRecordContractEvidence, { sessionId, contractId: "C-1", phase: "green", command: "x", exitCode: 0 });
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

describe("§10 decompose 오케스트레이션 — 전체 흐름", () => {
  async function toReady(prd = TWO_REQ_PRD): Promise<string> {
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
    const sessionId = start.data.sessionId as string;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    await call(handleSugoPlan, { action: "prd", sessionId, prdContent: prd });
    await call(handleSugoPlan, { action: "ready", sessionId });
    return sessionId;
  }

  it("사이클이 있는 매니페스트는 decompose 시점에 거부된다", async () => {
    const sessionId = await toReady();
    const result = await call(handleSugoPlan, {
      action: "decompose",
      sessionId,
      manifest: {
        subtasks: [
          { id: "S-1", title: "A", dependsOn: ["S-2"], files: [], coversRequirements: ["REQ-1"] },
          { id: "S-2", title: "B", dependsOn: ["S-1"], files: [], coversRequirements: ["REQ-2"] },
        ],
      },
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("MANIFEST_HAS_CYCLE");
  });

  it("요구사항이 커버되지 않으면 decompose가 거부된다", async () => {
    const sessionId = await toReady();
    const result = await call(handleSugoPlan, {
      action: "decompose",
      sessionId,
      manifest: { subtasks: [{ id: "S-1", title: "A", dependsOn: [], files: [], coversRequirements: ["REQ-1"] }] },
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("MANIFEST_REQUIREMENT_UNCOVERED");
  });

  it("전체 흐름: decompose→subtask_start×2→subtask_done×2→integrate→code_done까지 이어진다", async () => {
    const sessionId = await toReady();
    const decomposeResult = await call(handleSugoPlan, {
      action: "decompose",
      sessionId,
      manifest: {
        subtasks: [
          { id: "S-1", title: "이메일 로그인", dependsOn: [], files: ["email.ts"], coversRequirements: ["REQ-1"] },
          { id: "S-2", title: "소셜 로그인", dependsOn: [], files: ["social.ts"], coversRequirements: ["REQ-2"] },
        ],
      },
    });
    expect(decomposeResult.isError).toBe(false);
    expect(decomposeResult.data.state).toBe("DECOMPOSE");

    const s1 = await call(handleSugoPlan, { action: "subtask_start", sessionId, subtaskId: "S-1" });
    expect(s1.isError).toBe(false);
    expect(s1.data.state).toBe("ORCHESTRATING");

    const s2 = await call(handleSugoPlan, { action: "subtask_start", sessionId, subtaskId: "S-2" });
    expect(s2.isError).toBe(false);

    writeFileSync(join(projectDir, "email.ts"), "x");
    writeFileSync(join(projectDir, "social.ts"), "y");

    const integrateTooEarly = await call(handleSugoPlan, { action: "integrate", sessionId });
    expect(integrateTooEarly.isError).toBe(true);
    expect(integrateTooEarly.data.errorCode).toBe("SUBTASKS_INCOMPLETE");

    await call(handleSugoPlan, { action: "subtask_done", sessionId, subtaskId: "S-1", subtaskChangedFiles: ["email.ts"] });
    await call(handleSugoPlan, { action: "subtask_done", sessionId, subtaskId: "S-2", subtaskChangedFiles: ["social.ts"] });

    const integrateResult = await call(handleSugoPlan, { action: "integrate", sessionId });
    expect(integrateResult.isError).toBe(false);
    expect(integrateResult.data.state).toBe("CODE_RUNNING");

    await call(handleSugoAnalyze, { sessionId, changedFiles: ["email.ts", "social.ts"] });
    const codeDone = await call(handleSugoPlan, {
      action: "code_done",
      sessionId,
      changedFiles: ["email.ts", "social.ts"],
    });
    expect(codeDone.isError).toBe(false);
    expect(codeDone.data.state).toBe("CODE_DONE");
  });

  it("실제 변경파일이 겹치면 integrate 시점에 거부된다(계획엔 안 겹쳤어도)", async () => {
    const sessionId = await toReady();
    await call(handleSugoPlan, {
      action: "decompose",
      sessionId,
      manifest: {
        subtasks: [
          { id: "S-1", title: "A", dependsOn: [], files: ["a.ts"], coversRequirements: ["REQ-1"] },
          { id: "S-2", title: "B", dependsOn: [], files: ["b.ts"], coversRequirements: ["REQ-2"] },
        ],
      },
    });
    await call(handleSugoPlan, { action: "subtask_start", sessionId, subtaskId: "S-1" });
    await call(handleSugoPlan, { action: "subtask_start", sessionId, subtaskId: "S-2" });
    await call(handleSugoPlan, { action: "subtask_done", sessionId, subtaskId: "S-1", subtaskChangedFiles: ["shared.ts"] });
    await call(handleSugoPlan, { action: "subtask_done", sessionId, subtaskId: "S-2", subtaskChangedFiles: ["shared.ts"] });

    const integrateResult = await call(handleSugoPlan, { action: "integrate", sessionId });
    expect(integrateResult.isError).toBe(true);
    expect(integrateResult.data.errorCode).toBe("MANIFEST_FILE_OVERLAP");
  });
});
