import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  computeNextPatchVersion,
  findLatestPrdPatchFilename,
  patchPrdFilename,
  patchWorkResultFilename,
  PatchEntryError,
  resolvePatchContext,
  capturePostHocBaseline,
} from "../src/patch.js";

describe("computeNextPatchVersion", () => {
  it("patch 파일이 하나도 없으면(최초 feat만 있음) 첫 patch인 v1을 반환한다", () => {
    expect(computeNextPatchVersion(["prd.md", "work-result.md"])).toBe(1);
  });

  it("기존 patch 파일 중 최대 버전+1을 반환한다", () => {
    expect(computeNextPatchVersion(["prd.md", "PRD-patch-v2.md", "work-result-patch-v2.md"])).toBe(3);
  });

  it("prd/work-result 어느 쪽이든 최대값을 반영한다", () => {
    expect(computeNextPatchVersion(["PRD-patch-v2.md", "work-result-patch-v4.md"])).toBe(5);
  });
});

describe("findLatestPrdPatchFilename", () => {
  it("가장 버전이 높은 PRD-patch-v*.md를 찾는다", () => {
    expect(findLatestPrdPatchFilename(["PRD-patch-v2.md", "PRD-patch-v3.md", "work-result-patch-v3.md"])).toBe(
      "PRD-patch-v3.md",
    );
  });

  it("없으면 null", () => {
    expect(findLatestPrdPatchFilename(["prd.md", "work-result.md"])).toBeNull();
  });
});

describe("patchPrdFilename / patchWorkResultFilename", () => {
  it("버전 번호를 파일명에 반영한다", () => {
    expect(patchPrdFilename(2)).toBe("PRD-patch-v2.md");
    expect(patchWorkResultFilename(3)).toBe("work-result-patch-v3.md");
  });
});

let dirs: string[] = [];
function tmpFeatureDir(): string {
  const d = mkdtempSync(join(tmpdir(), "sugo-patch-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

describe("resolvePatchContext — 반드시 거부", () => {
  it("feature 디렉터리 자체가 없으면 PATCH_FEATURE_DIR_NOT_FOUND", async () => {
    await expect(resolvePatchContext(join(tmpdir(), "sugo-nonexistent-xyz", "work-result.md"))).rejects.toMatchObject({
      code: "PATCH_FEATURE_DIR_NOT_FOUND",
    });
  });

  it("prd.md도 PRD-patch-v*.md도 없으면 PATCH_PARENT_PRD_NOT_FOUND", async () => {
    const dir = tmpFeatureDir();
    writeFileSync(join(dir, "work-result.md"), "요약");
    await expect(resolvePatchContext(join(dir, "work-result.md"))).rejects.toMatchObject({
      code: "PATCH_PARENT_PRD_NOT_FOUND",
    });
  });

  it("실재하지 않거나 정식 work-result가 아닌 경로는 거부한다", async () => {
    const dir = tmpFeatureDir();
    writeFileSync(join(dir, "prd.md"), "REQ-1: 최초 요구사항");
    await expect(resolvePatchContext(join(dir, "work-result.md"))).rejects.toMatchObject({
      code: "PATCH_WORK_RESULT_NOT_FOUND",
    });
    writeFileSync(join(dir, "notes.md"), "임의 문서");
    await expect(resolvePatchContext(join(dir, "notes.md"))).rejects.toMatchObject({
      code: "PATCH_WORK_RESULT_INVALID",
    });
  });

  it("대상 프로젝트의 sugo/features 밖에 있는 결과는 거부한다", async () => {
    const project = tmpFeatureDir();
    const outside = tmpFeatureDir();
    writeFileSync(join(outside, "prd.md"), "REQ-1: 다른 프로젝트");
    writeFileSync(join(outside, "work-result.md"), "완료 결과");
    await expect(resolvePatchContext(join(outside, "work-result.md"), project)).rejects.toMatchObject({
      code: "PATCH_PROJECT_MISMATCH",
    });
  });
});

describe("resolvePatchContext — 반드시 허용", () => {
  it("최초 feat 산출물만 있으면 prd.md를 부모로, 첫 patch 버전 1을 계산한다", async () => {
    const dir = tmpFeatureDir();
    writeFileSync(join(dir, "prd.md"), "REQ-1: 최초 요구사항");
    writeFileSync(join(dir, "work-result.md"), "1차 요약");

    const ctx = await resolvePatchContext(join(dir, "work-result.md"));
    expect(ctx.parentPrdPath).toBe(join(dir, "prd.md"));
    expect(ctx.version).toBe(1);
    expect(ctx.featureDir).toBe(dir);
  });

  it("prd.md가 있으면 patch가 쌓여도 항상 최초 PRD를 부모로 삼는다(각 patch는 최초 PRD 대비 델타)", async () => {
    const dir = tmpFeatureDir();
    writeFileSync(join(dir, "prd.md"), "REQ-1: 최초");
    writeFileSync(join(dir, "PRD-patch-v2.md"), "REQ-1: 2차 변경분");
    writeFileSync(join(dir, "work-result-patch-v2.md"), "2차 요약");

    const ctx = await resolvePatchContext(join(dir, "work-result-patch-v2.md"));
    expect(ctx.parentPrdPath).toBe(join(dir, "prd.md"));
    expect(ctx.version).toBe(3);
  });

  it("prd.md가 없으면(최초 PRD 유실) PRD-patch-v*.md 최신본을 부모로 폴백한다", async () => {
    const dir = tmpFeatureDir();
    writeFileSync(join(dir, "PRD-patch-v2.md"), "REQ-1: 2차 변경분");
    writeFileSync(join(dir, "work-result-patch-v2.md"), "2차 요약");

    const ctx = await resolvePatchContext(join(dir, "work-result-patch-v2.md"));
    expect(ctx.parentPrdPath).toBe(join(dir, "PRD-patch-v2.md"));
    expect(ctx.version).toBe(3);
  });
});

describe("PatchEntryError", () => {
  it("code 프로퍼티를 노출한다", () => {
    const err = new PatchEntryError("PATCH_PARENT_PRD_NOT_FOUND", "메시지");
    expect(err.code).toBe("PATCH_PARENT_PRD_NOT_FOUND");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("capturePostHocBaseline", () => {
  function gitProject(): string {
    const dir = tmpFeatureDir();
    execFileSync("git", ["init"], { cwd: dir });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
    writeFileSync(join(dir, "app.ts"), "export const value = 1;\n");
    execFileSync("git", ["add", "app.ts"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "initial"], { cwd: dir });
    return dir;
  }

  it("커밋되지 않은 현재 변경은 HEAD를 기준선으로 삼고 변경파일을 서버가 수집한다", async () => {
    const dir = gitProject();
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
    writeFileSync(join(dir, "app.ts"), "export const value = 2;\n");

    await expect(capturePostHocBaseline(dir)).resolves.toMatchObject({
      baselineRevision: head,
      headAtCapture: head,
      changedFiles: ["app.ts"],
      source: "working-tree",
    });
  });

  it("사용자가 확정하지 않은 변경 범위는 거부하고 선택한 파일만 캡처한다", async () => {
    const dir = gitProject();
    writeFileSync(join(dir, "app.ts"), "export const value = 2;\n");
    writeFileSync(join(dir, "unrelated.ts"), "export const unrelated = true;\n");

    await expect(capturePostHocBaseline(dir, undefined, [], [])).rejects.toMatchObject({ code: "POST_HOC_SCOPE_REQUIRED" });
    await expect(capturePostHocBaseline(dir, undefined, [], ["missing.ts"])).rejects.toMatchObject({ code: "POST_HOC_SCOPE_INVALID" });
    await expect(capturePostHocBaseline(dir, undefined, [], ["app.ts"])).resolves.toMatchObject({
      changedFiles: ["app.ts"],
      source: "working-tree",
    });
  });

  it("clean 저장소는 명시한 이전 revision이 없으면 거부한다", async () => {
    const dir = gitProject();
    await expect(capturePostHocBaseline(dir)).rejects.toMatchObject({ code: "POST_HOC_BASELINE_REQUIRED" });
  });

  it("이미 커밋된 변경은 검증된 ancestor revision부터 HEAD까지의 파일을 수집한다", async () => {
    const dir = gitProject();
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
    writeFileSync(join(dir, "app.ts"), "export const value = 3;\n");
    execFileSync("git", ["add", "app.ts"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "change"], { cwd: dir });

    await expect(capturePostHocBaseline(dir, base)).resolves.toMatchObject({
      baselineRevision: base,
      changedFiles: ["app.ts"],
      source: "committed-range",
    });
  });

  it("커밋된 변경과 미커밋 변경이 함께 있으면 두 범위를 하나의 명시적 scope로 캡처한다", async () => {
    const dir = gitProject();
    const base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
    writeFileSync(join(dir, "app.ts"), "export const value = 3;\n");
    execFileSync("git", ["add", "app.ts"], { cwd: dir });
    execFileSync("git", ["commit", "-m", "change"], { cwd: dir });
    writeFileSync(join(dir, "followup.ts"), "export const followup = true;\n");

    await expect(capturePostHocBaseline(dir, base, [], ["app.ts", "followup.ts"])).resolves.toMatchObject({
      baselineRevision: base,
      changedFiles: ["app.ts", "followup.ts"],
      source: "mixed",
    });
  });
});
