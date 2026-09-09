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

/**
 * contractRedContractId가 주어지면 contract_start 이후 그 id로 red를 먼저 기록해두고 contract_done을
 * 부른다(§3 신규 gate: 계약필수인데 red가 하나도 없으면 이 단계에서 이미 막힌다 — 그 경계 자체는
 * integration.gates.test.ts의 "contract_done 게이트" 블록에서 전담 검증하고, 여기서는 review_done의
 * red→green 전체 재검증(§10)에 집중하기 위해 그 전제만 충족시켜둔다).
 */
async function toTestDonePass(
  prd = VALID_PRD,
  changedFile = "login.ts",
  contractRedContractId?: string,
): Promise<string> {
  writeFileSync(join(projectDir, changedFile), "content");
  const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
  const sessionId = start.data.sessionId as string;
  await call(handleSugoPlan, { action: "clarify", sessionId });
  await call(handleSugoPlan, { action: "prd", sessionId, prdContent: prd });
  await call(handleSugoPlan, { action: "ready", sessionId });
  await call(handleSugoPlan, { action: "baseline_capture", sessionId });
  await call(handleSugoPlan, { action: "contract_start", sessionId });
  if (contractRedContractId) {
    await call(handleSugoRecordContractEvidence, {
      sessionId,
      contractId: contractRedContractId,
      phase: "red",
      command: "x",
      exitCode: 1,
    });
  }
  await call(handleSugoPlan, { action: "contract_done", sessionId });
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

  it("§3 신규 gate: 필수인데 red 확인 자체가 없으면 code_start 전에 contract_done에서 이미 거부된다", async () => {
    // contract_done 상태전이 자체가 막아 code_start조차 못 간다 — review_done까지 끌고 가지
    // 않고 앞단에서 빨리 실패시키는 게 이 게이트의 요점이다.
    await call(handleSugoAdd, { projectPath: projectDir, contractEvidenceRequired: true });
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
    const sessionId = start.data.sessionId as string;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    await call(handleSugoPlan, { action: "prd", sessionId, prdContent: VALID_PRD });
    await call(handleSugoPlan, { action: "ready", sessionId });
    await call(handleSugoPlan, { action: "baseline_capture", sessionId });
    await call(handleSugoPlan, { action: "contract_start", sessionId });
    const contractDone = await call(handleSugoPlan, { action: "contract_done", sessionId });
    expect(contractDone.isError).toBe(true);
    expect(contractDone.data.errorCode).toBe("CONTRACT_NOT_STARTED");
  });

  it("red만 기록하고 green이 없으면 review_done에서 거부한다(자기보고 승격 차단)", async () => {
    await call(handleSugoAdd, { projectPath: projectDir, contractEvidenceRequired: true });
    const sessionId = await toTestDonePass(VALID_PRD, "login.ts", "C-1");
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

  it("green만 기록하고 red가 없으면 거부한다(자기보고 승격 차단 — C-1은 contract_done 통과용, C-2가 검증 대상)", async () => {
    await call(handleSugoAdd, { projectPath: projectDir, contractEvidenceRequired: true });
    const sessionId = await toTestDonePass(VALID_PRD, "login.ts", "C-1");
    await call(handleSugoRecordContractEvidence, { sessionId, contractId: "C-2", phase: "green", command: "x", exitCode: 0 });
    const result = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("CONTRACT_EVIDENCE_INCOMPLETE");
    expect(result.data.message).toContain("C-2");
  });

  it("red→green 전이를 실제로 기록하면 통과한다", async () => {
    await call(handleSugoAdd, { projectPath: projectDir, contractEvidenceRequired: true });
    const sessionId = await toTestDonePass(VALID_PRD, "login.ts", "C-1");
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
  // v2 §2.4: decompose 진입점은 PRD다(구 READY). 비대 PRD를 쪼개질지는 PRD 직후에 정한다.
  async function toPrd(prd = TWO_REQ_PRD): Promise<string> {
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
    const sessionId = start.data.sessionId as string;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    await call(handleSugoPlan, { action: "prd", sessionId, prdContent: prd });
    return sessionId;
  }

  it("사이클이 있는 매니페스트는 decompose 시점에 거부된다", async () => {
    const sessionId = await toPrd();
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
    const sessionId = await toPrd();
    const result = await call(handleSugoPlan, {
      action: "decompose",
      sessionId,
      manifest: { subtasks: [{ id: "S-1", title: "A", dependsOn: [], files: [], coversRequirements: ["REQ-1"] }] },
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("MANIFEST_REQUIREMENT_UNCOVERED");
  });

  it("전체 흐름: decompose→subtask_start×2→subtask_done×2→integrate→docs_done까지 이어진다", async () => {
    const sessionId = await toPrd();
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

    // P5-24 통합 게이트: 서브태스크마다 파이프라인을 강제하진 않지만, **합류 지점에서는 한 번**
    // code_done과 같은 내용 게이트를 통과해야 한다. analyze 미호출이면 여기서 막힌다.
    const blocked = await call(handleSugoPlan, { action: "integrate", sessionId });
    expect(blocked.isError).toBe(true);
    expect(blocked.data.errorCode).toBe("ANALYZE_NOT_CALLED");

    await call(handleSugoAnalyze, { sessionId, changedFiles: ["email.ts", "social.ts"] });

    // v2 §4 흐름도: integrate는 CODE_RUNNING이 아니라 DOCS_PENDING으로 합류한다 — 서브태스크가
    // 각자 구현을 끝낸 상태라 통합 후엔 코딩으로 되돌아가지 않고 문서화→커밋으로 간다.
    const integrateResult = await call(handleSugoPlan, { action: "integrate", sessionId });
    expect(integrateResult.isError).toBe(false);
    expect(integrateResult.data.state).toBe("DOCS_PENDING");

    const docsDone = await call(handleSugoPlan, { action: "docs_done", sessionId });
    expect(docsDone.isError).toBe(false);
    expect(docsDone.data.state).toBe("COMMIT_PENDING");
  });

  it("실제 변경파일이 겹치면 integrate 시점에 거부된다(계획엔 안 겹쳤어도)", async () => {
    const sessionId = await toPrd();
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

/**
 * **서브태스크마다 미니 파이프라인은 강제하지 않는다.** 쪼갠 일을 각자 알아서 하라고 나눈
 * 건데 거기 또 게이트를 걸면 decompose를 쓸 이유가 없다. 대신 **합쳐서 나가는 integrate 한
 * 지점**에서 code_done과 같은 내용 게이트를 통과해야 한다 — integrate가 DOCS_PENDING으로
 * 합류하면서 생기는 게이트 공백을 이걸로 닫는다.
 */
describe("§10 통합 게이트 — 각자는 자유, 합류는 검증(P5-24)", () => {
  async function toOrchestrating(): Promise<string> {
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
    const sessionId = start.data.sessionId as string;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    await call(handleSugoPlan, { action: "prd", sessionId, prdContent: TWO_REQ_PRD });
    await call(handleSugoPlan, {
      action: "decompose",
      sessionId,
      manifest: {
        subtasks: [
          { id: "S-1", title: "A", dependsOn: [], files: ["email.ts"], coversRequirements: ["REQ-1"] },
          { id: "S-2", title: "B", dependsOn: [], files: ["social.ts"], coversRequirements: ["REQ-2"] },
        ],
      },
    });
    await call(handleSugoPlan, { action: "subtask_start", sessionId, subtaskId: "S-1" });
    await call(handleSugoPlan, { action: "subtask_start", sessionId, subtaskId: "S-2" });
    return sessionId;
  }

  it("서브태스크 진행 자체에는 게이트가 없다(자유롭게 start/done 가능)", async () => {
    const sessionId = await toOrchestrating();
    const d1 = await call(handleSugoPlan, { action: "subtask_done", sessionId, subtaskId: "S-1", subtaskChangedFiles: ["email.ts"] });
    const d2 = await call(handleSugoPlan, { action: "subtask_done", sessionId, subtaskId: "S-2", subtaskChangedFiles: ["social.ts"] });
    expect(d1.isError).toBe(false);
    expect(d2.isError).toBe(false);
  });

  it("거부: 합류 시점에 analyze 실호출 이력이 없으면 막힌다", async () => {
    const sessionId = await toOrchestrating();
    await call(handleSugoPlan, { action: "subtask_done", sessionId, subtaskId: "S-1", subtaskChangedFiles: ["email.ts"] });
    await call(handleSugoPlan, { action: "subtask_done", sessionId, subtaskId: "S-2", subtaskChangedFiles: ["social.ts"] });

    const r = await call(handleSugoPlan, { action: "integrate", sessionId });
    expect(r.isError).toBe(true);
    expect(r.data.errorCode).toBe("ANALYZE_NOT_CALLED");
  });

  it("거부: 병합된 변경파일에 배선 변경이 있는데 배선 테스트가 없으면 막힌다", async () => {
    writeFileSync(join(projectDir, "application.yml"), "server:\n  port: 8080\n");
    const sessionId = await toOrchestrating();
    await call(handleSugoPlan, { action: "subtask_done", sessionId, subtaskId: "S-1", subtaskChangedFiles: ["application.yml"] });
    await call(handleSugoPlan, { action: "subtask_done", sessionId, subtaskId: "S-2", subtaskChangedFiles: ["social.ts"] });
    await call(handleSugoAnalyze, { sessionId, changedFiles: ["application.yml", "social.ts"] });

    const r = await call(handleSugoPlan, { action: "integrate", sessionId });
    expect(r.isError).toBe(true);
    expect(r.data.errorCode).toBe("WIRING_TEST_MISSING");
  });

  it("허용: 배선 변경을 신고하고 배선 테스트를 추가했다고 밝히면 통과한다", async () => {
    writeFileSync(join(projectDir, "application.yml"), "server:\n  port: 8080\n");
    const sessionId = await toOrchestrating();
    await call(handleSugoPlan, { action: "subtask_done", sessionId, subtaskId: "S-1", subtaskChangedFiles: ["application.yml"] });
    await call(handleSugoPlan, { action: "subtask_done", sessionId, subtaskId: "S-2", subtaskChangedFiles: ["social.ts"] });
    await call(handleSugoAnalyze, { sessionId, changedFiles: ["application.yml", "social.ts"] });

    const r = await call(handleSugoPlan, { action: "integrate", sessionId, wiringTestAdded: true });
    expect(r.isError).toBe(false);
    expect(r.data.state).toBe("DOCS_PENDING");
  });
});
