import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { snapshotWorkResultFiles } from "../src/dashboard/workResultFiles.js";

let roots: string[] = [];
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

describe("snapshotWorkResultFiles", () => {
  it("실제 변경파일 내용을 dashboard WorkResult에 스냅샷한다", async () => {
    const root = mkdtempSync(join(tmpdir(), "sugo-work-result-files-"));
    roots.push(root);
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "feature.ts"), "export const feature = true;\n");

    const [file] = await snapshotWorkResultFiles(root, ["src/feature.ts"]);
    expect(file).toEqual(expect.objectContaining({
      path: "src/feature.ts",
      change: "modified",
      content: "export const feature = true;\n",
    }));
  });

  it("프로젝트 밖 경로는 읽지 않는다", async () => {
    const root = mkdtempSync(join(tmpdir(), "sugo-work-result-files-"));
    roots.push(root);
    expect(await snapshotWorkResultFiles(root, ["../secret.txt"])).toEqual([
      { path: "../secret.txt", change: "modified" },
    ]);
  });
});
