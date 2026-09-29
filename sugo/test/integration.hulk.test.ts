import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoAdd } from "../src/tools/sugoAdd.js";
import { handleSugoAnalyze } from "../src/tools/sugoAnalyze.js";
import { handleSugoCheckpoint } from "../src/tools/sugoCheckpoint.js";
import { handleSugoHistory } from "../src/tools/sugoHistory.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";
import { handleSugoRecordTestEvidence } from "../src/tools/sugoRecordTestEvidence.js";
import { handleSugoCheckLethalTrifecta } from "../src/tools/sugoCheckLethalTrifecta.js";
import { handleSugoValidate } from "../src/tools/sugoValidate.js";
import { handleSugoSpec } from "../src/tools/sugoSpec.js";
import { handleSugoTask } from "../src/tools/sugoTask.js";
import { handleSugoWorkspace } from "../src/tools/sugoWorkspace.js";

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
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-hulke2e-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "sugo-hulke2e-project-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

describe("HULK 전체 흐름: workspace 등록 → prd 자동 Task → commit 자동 WorkLog", () => {
  it("전체 파이프라인이 HULK 데이터를 정확히 누적한다", async () => {
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ dependencies: {}, devDependencies: { typescript: "^5.4.0" } }));
    // strict/moduleResolution 없는 빈 tsconfig는 lang/typescript(/5.x) 하네스의 auto 체크(실제 파일
    // 실측)를 진짜로 위반한다 — 이 테스트가 검증하려는 건 HULK 누적이라 하네스 위반과 무관해야 한다.
    writeFileSync(join(projectDir, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true, moduleResolution: "bundler" } }));

    const add = await call(handleSugoAdd, { projectPath: projectDir, workspace: "team-a" });
    expect(add.isError).toBe(false);
    expect(add.data.workspace).toBe("team-a");

    const wsGet = await call(handleSugoWorkspace, { action: "get", name: "team-a" });
    expect(wsGet.data.workspace.projects).toContain(projectDir);

    const cp = await call(handleSugoCheckpoint, {
      action: "add",
      workspace: "team-a",
      title: "TS 커밋 전 체크",
      applies_to: ["lang/typescript"],
      checklist: ["strict 모드 확인", "any 없음 확인"],
    });
    expect(cp.isError).toBe(false);

    await call(handleSugoSpec, {
      action: "add",
      workspace: "team-a",
      name: "인증 아키텍처",
      type: "architecture",
      content: "# 인증\n\nJWT 기반",
    });

    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
    const sessionId = start.data.sessionId;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    const prd = await call(handleSugoPlan, { action: "prd", sessionId, prdContent: VALID_PRD });
    expect(prd.isError).toBe(false);

    const tasksAfterPrd = await call(handleSugoTask, { action: "list", workspace: "team-a" });
    expect(tasksAfterPrd.data.tasks.length).toBe(1);
    expect(tasksAfterPrd.data.tasks[0].status).toBe("in_progress");
    expect(tasksAfterPrd.data.tasks[0].prd_ref).toBe(prd.data.prdPath);
    const taskId = tasksAfterPrd.data.tasks[0].id;

    await call(handleSugoPlan, { action: "ready", sessionId });
    await call(handleSugoPlan, { action: "baseline_capture", sessionId });
    await call(handleSugoPlan, { action: "contract_start", sessionId });
    await call(handleSugoPlan, { action: "contract_done", sessionId });
    await call(handleSugoPlan, { action: "code_start", sessionId });
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
    await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: ["login.ts"] });
    await call(handleSugoPlan, { action: "test_start", sessionId });
    await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 0, failed: 0 });
    await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });
    await call(handleSugoPlan, { action: "review_start", sessionId });
    await call(handleSugoValidate, { sessionId: sessionId, validationResults: [] }); // VALIDATE_NOT_CALLED 게이트 충족용
    await call(handleSugoCheckLethalTrifecta, { sessionId: sessionId, tools: [] }); // LETHAL_TRIFECTA_NOT_CALLED 게이트 충족용
    await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    await call(handleSugoPlan, { action: "docs_done", sessionId });

    const commit = await call(handleSugoPlan, { action: "commit", sessionId, userReportedHumanHours: 2.5 });
    expect(commit.isError).toBe(false);
    expect(commit.data.hulk.taskId).toBe(taskId);
    expect(commit.data.hulk.checkpointsToReview.length).toBe(1);
    expect(commit.data.hulk.checkpointsToReview[0].checklist).toEqual(["strict 모드 확인", "any 없음 확인"]);

    const taskAfterCommit = await call(handleSugoTask, { action: "get", workspace: "team-a", taskId });
    expect(taskAfterCommit.data.task.status).toBe("done");
    expect(taskAfterCommit.data.task.log_id).toBe(commit.data.hulk.workLogId);

    const history = await call(handleSugoHistory, { action: "list", workspace: "team-a" });
    expect(history.data.workLogs.length).toBe(1);
    expect(history.data.workLogs[0].summary).toBe(GOOD_SUMMARY);
    expect(history.data.workLogs[0].files_changed).toEqual(["login.ts"]);
    expect(history.data.workLogs[0].metrics.userReportedHumanHours).toBe(2.5);
    expect(history.data.workLogs[0].metrics.estimatedHumanHours).toBeGreaterThanOrEqual(0);
  });

  it("워크스페이스 없는 프로젝트는 HULK 연동이 자동으로 스킵된다(하위호환)", async () => {
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "no-ws" });
    const sessionId = start.data.sessionId;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    const prd = await call(handleSugoPlan, { action: "prd", sessionId, prdContent: VALID_PRD });
    expect(prd.isError).toBe(false);

    const status = await call(handleSugoPlan, { action: "status", sessionId });
    expect(status.isError).toBe(false); // 세션 자체는 정상 진행, HULK 필드만 비어있음
  });

  it("sugo_workspace remember/recall이 정상 동작한다", async () => {
    await call(handleSugoWorkspace, { action: "add", name: "team-a" });
    await call(handleSugoWorkspace, { action: "remember", name: "team-a", note: "빌드는 항상 --strict로" });
    const recall = await call(handleSugoWorkspace, { action: "recall", name: "team-a" });
    expect(recall.data.memory).toContain("빌드는 항상 --strict로");
  });
});
