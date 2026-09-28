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
} from "../src/patch.js";

describe("computeNextPatchVersion", () => {
  it("patch 파일이 하나도 없으면(원본 feat만 있음) 첫 patch인 v1을 반환한다", () => {
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
});

describe("resolvePatchContext — 반드시 허용", () => {
  it("최초 feat 산출물만 있으면 prd.md를 부모로, 첫 patch 버전 1을 계산한다", async () => {
    const dir = tmpFeatureDir();
    writeFileSync(join(dir, "prd.md"), "REQ-1: 원본 요구사항");
    writeFileSync(join(dir, "work-result.md"), "1차 요약");

    const ctx = await resolvePatchContext(join(dir, "work-result.md"));
    expect(ctx.parentPrdPath).toBe(join(dir, "prd.md"));
    expect(ctx.version).toBe(1);
    expect(ctx.featureDir).toBe(dir);
  });

  it("prd.md가 있으면 patch가 쌓여도 항상 원본을 부모로 삼는다(각 patch는 원본 대비 델타)", async () => {
    const dir = tmpFeatureDir();
    writeFileSync(join(dir, "prd.md"), "REQ-1: 원본");
    writeFileSync(join(dir, "PRD-patch-v2.md"), "REQ-1: 2차 변경분");
    writeFileSync(join(dir, "work-result-patch-v2.md"), "2차 요약");

    const ctx = await resolvePatchContext(join(dir, "work-result-patch-v2.md"));
    expect(ctx.parentPrdPath).toBe(join(dir, "prd.md"));
    expect(ctx.version).toBe(3);
  });

  it("prd.md가 없으면(원본 유실) PRD-patch-v*.md 최신본을 부모로 폴백한다", async () => {
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
