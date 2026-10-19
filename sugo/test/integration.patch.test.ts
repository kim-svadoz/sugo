import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoAdd } from "../src/tools/sugoAdd.js";
import { handleSugoAnalyze } from "../src/tools/sugoAnalyze.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";
import { handleSugoRecordTestEvidence } from "../src/tools/sugoRecordTestEvidence.js";
import { handleSugoCheckLethalTrifecta } from "../src/tools/sugoCheckLethalTrifecta.js";
import { handleSugoValidate } from "../src/tools/sugoValidate.js";
import { handleSugoTask } from "../src/tools/sugoTask.js";
import { listRoadmapNodes } from "../src/work/roadmap.js";
import { loadSession } from "../src/session.js";

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
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-patch-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "sugo-patch-project-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

/** 1차(plan 모드) 파이프라인을 review_done까지 몰아 work-result.md를 만든다. */
async function runFirstRoundToReviewDone(
  wiringTestAdded = true,
): Promise<{ sessionId: string; workResultPath: string; prdPath: string }> {
  const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "login" });
  const sessionId = start.data.sessionId as string;
  await call(handleSugoPlan, { action: "clarify", sessionId });
  const prd = await call(handleSugoPlan, { action: "prd", sessionId, prdContent: VALID_PRD });
  await call(handleSugoPlan, { action: "ready", sessionId });
  await call(handleSugoPlan, { action: "baseline_capture", sessionId });
  await call(handleSugoPlan, { action: "contract_start", sessionId });
  await call(handleSugoPlan, { action: "contract_done", sessionId });
  await call(handleSugoPlan, { action: "code_start", sessionId });
  await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
  await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [], wiringTestAdded });
  await call(handleSugoPlan, { action: "test_start", sessionId });
  await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 0, failed: 0 });
  await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });
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
  return { sessionId, workResultPath: reviewDone.data.workResultPath, prdPath: prd.data.prdPath ?? "" };
}

describe("Patch 진입 — 반드시 거부", () => {
  it("feature 디렉터리가 존재하지 않으면 PATCH_FEATURE_DIR_NOT_FOUND", async () => {
    const result = await call(handleSugoPlan, {
      action: "start",
      projectPath: projectDir,
      featureName: "x",
      workResultPath: join(projectDir, "no-such-dir", "work-result.md"),
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("PATCH_FEATURE_DIR_NOT_FOUND");
  });

  it("prd.md도 PRD-patch도 없는 디렉터리면 PATCH_PARENT_PRD_NOT_FOUND", async () => {
    const isolatedDir = join(projectDir, "sugo", "features", "20260101", "orphan");
    mkdirSync(isolatedDir, { recursive: true });
    writeFileSync(join(isolatedDir, "work-result.md"), "부모 없는 산출물");

    const result = await call(handleSugoPlan, {
      action: "start",
      projectPath: projectDir,
      featureName: "orphan-patch",
      workResultPath: join(isolatedDir, "work-result.md"),
    });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("PATCH_PARENT_PRD_NOT_FOUND");
  });
});

describe("사후 patch 연결 — 서버 강제 계약", () => {
  function prepareGitPatch(): string {
    execFileSync("git", ["init"], { cwd: projectDir });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: projectDir });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: projectDir });
    writeFileSync(join(projectDir, "app.ts"), "export const value = 1;\n");
    execFileSync("git", ["add", "app.ts"], { cwd: projectDir });
    execFileSync("git", ["commit", "-m", "initial"], { cwd: projectDir });
    const featureDir = join(projectDir, "sugo", "features", "20261016", "login");
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, "prd.md"), VALID_PRD);
    writeFileSync(join(featureDir, "work-result.md"), "완료 결과");
    return join(featureDir, "work-result.md");
  }

  it("captured-post-hoc는 기존 work-result와 사용자 의도를 모두 요구한다", async () => {
    const noPatch = await call(handleSugoPlan, {
      action: "start", projectPath: projectDir, featureName: "login", patchProvenance: "captured-post-hoc", seed: "수정 연결",
    });
    expect(noPatch.data.errorCode).toBe("POST_HOC_PATCH_REQUIRED");

    const workResultPath = prepareGitPatch();
    writeFileSync(join(projectDir, "app.ts"), "export const value = 2;\n");
    const noSeed = await call(handleSugoPlan, {
      action: "start", projectPath: projectDir, featureName: "login", workResultPath, patchProvenance: "captured-post-hoc",
    });
    expect(noSeed.data.errorCode).toBe("POST_HOC_SEED_REQUIRED");

    const noScope = await call(handleSugoPlan, {
      action: "start", projectPath: projectDir, featureName: "login", workResultPath,
      seed: "수정 연결", patchProvenance: "captured-post-hoc",
    });
    expect(noScope.data.errorCode).toBe("POST_HOC_SCOPE_REQUIRED");
  });

  it("dirty 변경의 Git 기준선·변경파일·출처를 세션과 patch PRD에 서버가 기록한다", async () => {
    const workResultPath = prepareGitPatch();
    writeFileSync(join(projectDir, "app.ts"), "export const value = 2;\n");
    const start = await call(handleSugoPlan, {
      action: "start", projectPath: projectDir, featureName: "login", workResultPath,
      seed: "대화에서 수정한 값을 기존 login 작업에 연결", patchProvenance: "captured-post-hoc", postHocChangedFiles: ["app.ts"],
    });
    expect(start.isError).toBe(false);
    const sessionId = start.data.sessionId as string;
    const session = await loadSession(sessionId);
    expect(session.data.postHocCapture).toMatchObject({ provenance: "captured-post-hoc", changedFiles: ["app.ts"], source: "working-tree" });

    await call(handleSugoPlan, { action: "clarify", sessionId });
    const prd = await call(handleSugoPlan, { action: "prd", sessionId, prdContent: VALID_PRD });
    const content = readFileSync(prd.data.prdPath, "utf8");
    expect(content).toContain("Provenance: captured-post-hoc");
    expect(content).toContain(`Baseline: ${session.data.postHocCapture?.baselineRevision}`);
  });

  it("다른 프로젝트의 work-result에는 현재 프로젝트 변경을 연결하지 않는다", async () => {
    prepareGitPatch();
    writeFileSync(join(projectDir, "app.ts"), "export const value = 2;\n");
    const other = mkdtempSync(join(tmpdir(), "sugo-other-project-"));
    try {
      const featureDir = join(other, "sugo", "features", "20261016", "other");
      mkdirSync(featureDir, { recursive: true });
      writeFileSync(join(featureDir, "prd.md"), VALID_PRD);
      const foreignResult = join(featureDir, "work-result.md");
      writeFileSync(foreignResult, "완료 결과");
      const result = await call(handleSugoPlan, {
        action: "start", projectPath: projectDir, featureName: "login", workResultPath: foreignResult,
        seed: "잘못된 연결", patchProvenance: "captured-post-hoc", postHocChangedFiles: ["app.ts"],
      });
      expect(result.data.errorCode).toBe("PATCH_PROJECT_MISMATCH");
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("동일한 변경 범위와 계보를 두 번 연결하지 않는다", async () => {
    const workResultPath = prepareGitPatch();
    writeFileSync(join(projectDir, "app.ts"), "export const value = 2;\n");
    const args = {
      action: "start", projectPath: projectDir, featureName: "login", workResultPath,
      seed: "동일 변경", patchProvenance: "captured-post-hoc", postHocChangedFiles: ["app.ts"],
    };
    expect((await call(handleSugoPlan, args)).isError).toBe(false);
    const duplicate = await call(handleSugoPlan, args);
    expect(duplicate.data.errorCode).toBe("POST_HOC_DUPLICATE");
  });

  it("등록된 Workspace에서 기존 Task 계보를 찾지 못하면 새 Task를 만들지 않고 중단한다", async () => {
    await call(handleSugoAdd, { projectPath: projectDir, workspace: "post-hoc-missing-lineage" });
    execFileSync("git", ["init"], { cwd: projectDir });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: projectDir });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: projectDir });
    writeFileSync(join(projectDir, "app.ts"), "export const value = 1;\n");
    execFileSync("git", ["add", "."], { cwd: projectDir });
    execFileSync("git", ["commit", "-m", "initial"], { cwd: projectDir });
    const featureDir = join(projectDir, "sugo", "features", "20261016", "login");
    mkdirSync(featureDir, { recursive: true });
    writeFileSync(join(featureDir, "prd.md"), VALID_PRD);
    const workResultPath = join(featureDir, "work-result.md");
    writeFileSync(workResultPath, "완료 결과");
    writeFileSync(join(projectDir, "app.ts"), "export const value = 2;\n");

    const result = await call(handleSugoPlan, {
      action: "start", projectPath: projectDir, featureName: "login", workResultPath,
      seed: "변경 연결", patchProvenance: "captured-post-hoc", postHocChangedFiles: ["app.ts"],
    });
    expect(result.data.errorCode).toBe("POST_HOC_LINEAGE_NOT_FOUND");
  });
});

describe("Patch 전체 흐름", () => {
  it("v0 feat 산출물로 첫 patch에 진입하면 mode=patch, version=1, 부모=최초 prd.md", async () => {
    const { workResultPath, prdPath } = await runFirstRoundToReviewDone();
    expect(existsSync(workResultPath)).toBe(true);
    expect(existsSync(prdPath)).toBe(true);

    const patchStart = await call(handleSugoPlan, {
      action: "start",
      projectPath: projectDir,
      featureName: "login-patch",
      workResultPath,
    });
    expect(patchStart.isError).toBe(false);
    expect(patchStart.data.patch.version).toBe(1);
    expect(patchStart.data.patch.parentPrdPath).toBe(prdPath);
  });

  it("patch 모드의 PRD는 prd.md를 덮어쓰지 않고 PRD-patch-v1.md로 새로 저장된다", async () => {
    const { workResultPath, prdPath } = await runFirstRoundToReviewDone();
    const originalPrdContent = readFileSync(prdPath, "utf-8");

    const patchStart = await call(handleSugoPlan, {
      action: "start",
      projectPath: projectDir,
      featureName: "login-patch",
      workResultPath,
    });
    const sessionId = patchStart.data.sessionId as string;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    const patchPrdContent = "REQ-1: 소셜 로그인도 추가로 지원한다. " + "나".repeat(90);
    const prdResult = await call(handleSugoPlan, { action: "prd", sessionId, prdContent: patchPrdContent });

    expect(prdResult.isError).toBe(false);
    expect(prdResult.data.state).toBe("PRD");
    expect(readFileSync(prdPath, "utf-8")).toBe(originalPrdContent); // 최초 PRD 불변
    const patchPrdPath = join(join(prdPath, ".."), "PRD-patch-v1.md");
    expect(existsSync(patchPrdPath)).toBe(true);
    expect(readFileSync(patchPrdPath, "utf-8")).toBe(patchPrdContent);
  });

  it("patch 모드는 배선변경 없어도 wiring 게이트가 자동 트리거된다", async () => {
    const { workResultPath } = await runFirstRoundToReviewDone();
    const patchStart = await call(handleSugoPlan, {
      action: "start",
      projectPath: projectDir,
      featureName: "login-patch",
      workResultPath,
    });
    const sessionId = patchStart.data.sessionId as string;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    await call(handleSugoPlan, { action: "prd", sessionId, prdContent: "REQ-1: 추가 기능. " + "다".repeat(90) });
    await call(handleSugoPlan, { action: "ready", sessionId });
    await call(handleSugoPlan, { action: "baseline_capture", sessionId });
    await call(handleSugoPlan, { action: "contract_start", sessionId });
    await call(handleSugoPlan, { action: "contract_done", sessionId });
    await call(handleSugoPlan, { action: "code_start", sessionId });
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });

    const codeDoneNoWiringTest = await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [] });
    expect(codeDoneNoWiringTest.isError).toBe(true);
    expect(codeDoneNoWiringTest.data.errorCode).toBe("WIRING_TEST_MISSING");

    const codeDoneOk = await call(handleSugoPlan, {
      action: "code_done",
      sessionId,
      changedFiles: [],
      wiringTestAdded: true,
    });
    expect(codeDoneOk.isError).toBe(false);
  });

  it("v1 patch 산출물로 다음 patch에 진입하면 version=2, 부모는 여전히 최초 prd.md", async () => {
    const { workResultPath: firstWorkResult, prdPath } = await runFirstRoundToReviewDone();

    const patchStart = await call(handleSugoPlan, {
      action: "start",
      projectPath: projectDir,
      featureName: "login-patch",
      workResultPath: firstWorkResult,
    });
    const sessionId = patchStart.data.sessionId as string;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    await call(handleSugoPlan, { action: "prd", sessionId, prdContent: "REQ-1: 2차 변경. " + "다".repeat(90) });
    await call(handleSugoPlan, { action: "ready", sessionId });
    await call(handleSugoPlan, { action: "baseline_capture", sessionId });
    await call(handleSugoPlan, { action: "contract_start", sessionId });
    await call(handleSugoPlan, { action: "contract_done", sessionId });
    await call(handleSugoPlan, { action: "code_start", sessionId });
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
    await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [], wiringTestAdded: true });
    await call(handleSugoPlan, { action: "test_start", sessionId });
    await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 0, failed: 0 });
    await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });
    await call(handleSugoPlan, { action: "review_start", sessionId });
    await call(handleSugoValidate, { sessionId: sessionId, validationResults: [] }); // VALIDATE_NOT_CALLED 게이트 충족용
    await call(handleSugoCheckLethalTrifecta, { sessionId: sessionId, tools: [] }); // LETHAL_TRIFECTA_NOT_CALLED 게이트 충족용
    const secondReviewDone = await call(handleSugoPlan, {
      action: "review_done",
      sessionId,
      userConfirmed: true,
      summary: GOOD_SUMMARY,
      runtimeCheck: { buildAttempted: true, testRun: true, runtimeVerified: true },
    });
    const secondWorkResult = secondReviewDone.data.workResultPath as string;
    expect(secondWorkResult).toContain("work-result-patch-v1.md");

    const thirdStart = await call(handleSugoPlan, {
      action: "start",
      projectPath: projectDir,
      featureName: "login-patch-2",
      workResultPath: secondWorkResult,
    });
    expect(thirdStart.isError).toBe(false);
    expect(thirdStart.data.patch.version).toBe(2);
    expect(thirdStart.data.patch.parentPrdPath).toBe(prdPath);
  });

  it("workResultPath 없이 start하면 100% 기존(신규 PRD, mode=plan) 동작이다(하위호환)", async () => {
    const result = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "fresh" });
    expect(result.isError).toBe(false);
    expect(result.data.patch).toBeUndefined();

    const status = await call(handleSugoPlan, { action: "status", sessionId: result.data.sessionId });
    expect(status.isError).toBe(false);
  });
});

describe("Patch — Run 재사용 + seed + patchInfo + lineage", () => {
  it("patch 2차 진입은 새 Task를 만들지 않고 기존 Task를 재사용한다(prd_ref 매칭)", async () => {
    await call(handleSugoAdd, { projectPath: projectDir, workspace: "team-patch" });
    const { workResultPath } = await runFirstRoundToReviewDone();

    const tasksAfterFirst = await call(handleSugoTask, { action: "list", workspace: "team-patch" });
    expect(tasksAfterFirst.data.tasks).toHaveLength(1);
    const originalTaskId = tasksAfterFirst.data.tasks[0].id;

    const patchStart = await call(handleSugoPlan, {
      action: "start",
      projectPath: projectDir,
      featureName: "login-patch",
      workResultPath,
      seed: "결제 실패 시 재시도 로직도 추가해달라는 요청이 있었다",
    });
    const sessionId = patchStart.data.sessionId as string;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    await call(handleSugoPlan, { action: "prd", sessionId, prdContent: "REQ-1: 재시도 로직 추가. " + "다".repeat(90) });

    const tasksAfterPatch = await call(handleSugoTask, { action: "list", workspace: "team-patch" });
    // 새 Task가 생기지 않고 여전히 1개 — 기존 Run을 재사용했다는 증거.
    expect(tasksAfterPatch.data.tasks).toHaveLength(1);
    expect(tasksAfterPatch.data.tasks[0].id).toBe(originalTaskId);
    expect(tasksAfterPatch.data.tasks[0].status).toBe("in_progress");
    const roadmapAfterPatch = await listRoadmapNodes("team-patch");
    expect(roadmapAfterPatch.filter((node) => node.level === "workstream")).toHaveLength(1);
    const patchTask = roadmapAfterPatch.find((node) => node.id === originalTaskId);
    expect(patchTask?.parent).toBe(`run-${originalTaskId}`);
    expect(patchTask?.lineage?.map((entry) => entry.version)).toEqual([0, 1]);
    expect(patchTask?.lineage?.[0].workResult?.path).toBe(workResultPath);
    expect(patchTask?.lineage?.[1].title).toBe("결제 실패 시 재시도 로직도 추가해달라는 요청이 있었다");

    // patchInfo(lineage)가 기록됐다 — parentTaskId는 "이 Task 자신"(재사용이므로 자기참조).
    expect(tasksAfterPatch.data.tasks[0].patchInfo).toEqual(expect.objectContaining({
      parentTaskId: originalTaskId,
      patchVersion: 1,
      baseWorkResultPath: workResultPath,
      seed: "결제 실패 시 재시도 로직도 추가해달라는 요청이 있었다",
    }));
  });

  it("seed가 있으면 work-result에 그대로 실린다", async () => {
    await call(handleSugoAdd, { projectPath: projectDir, workspace: "team-patch2" });
    const { workResultPath } = await runFirstRoundToReviewDone();

    const patchStart = await call(handleSugoPlan, {
      action: "start",
      projectPath: projectDir,
      featureName: "login-patch",
      workResultPath,
      seed: "이번엔 로그아웃 기능도 같이 부탁한다",
    });
    const sessionId = patchStart.data.sessionId as string;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    await call(handleSugoPlan, { action: "prd", sessionId, prdContent: "REQ-1: 로그아웃 기능. " + "다".repeat(90) });
    await call(handleSugoPlan, { action: "ready", sessionId });
    await call(handleSugoPlan, { action: "baseline_capture", sessionId });
    await call(handleSugoPlan, { action: "contract_start", sessionId });
    await call(handleSugoPlan, { action: "contract_done", sessionId });
    await call(handleSugoPlan, { action: "code_start", sessionId });
    await call(handleSugoAnalyze, { sessionId, changedFiles: [] });
    await call(handleSugoPlan, { action: "code_done", sessionId, changedFiles: [], wiringTestAdded: true });
    await call(handleSugoPlan, { action: "test_start", sessionId });
    await call(handleSugoRecordTestEvidence, { sessionId, command: "npm test", exitCode: 0, failed: 0 });
    await call(handleSugoPlan, { action: "test_done", sessionId, testPassed: true });
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

    const content = readFileSync(reviewDone.data.workResultPath, "utf-8");
    expect(content).toContain(GOOD_SUMMARY);
    expect(content).toContain("이번엔 로그아웃 기능도 같이 부탁한다");
  });

  it("워크스페이스 미등록 프로젝트는 base-task를 찾을 수 없으므로 안전하게 새 Task를 만든다(폴백)", async () => {
    // 워크스페이스에 아예 등록 안 함 — registryEntry.workspace가 없으므로 워크스페이스 연동 자체가 no-op.
    const { workResultPath } = await runFirstRoundToReviewDone();
    const patchStart = await call(handleSugoPlan, {
      action: "start",
      projectPath: projectDir,
      featureName: "login-patch",
      workResultPath,
    });
    const sessionId = patchStart.data.sessionId as string;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    const prd = await call(handleSugoPlan, { action: "prd", sessionId, prdContent: "REQ-1: 추가. " + "다".repeat(90) });
    expect(prd.isError).toBe(false);
  });
});
