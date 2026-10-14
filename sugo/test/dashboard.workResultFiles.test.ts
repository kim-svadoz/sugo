import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { snapshotWorkResultFiles } from "../src/dashboard/workResultFiles.js";
import { execFileSync } from "node:child_process";

let roots: string[] = [];
afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

describe("snapshotWorkResultFiles", () => {
  it("작업 중 커밋된 수정도 완료 스냅샷에 diff를 유지한다", async () => {
    const root = mkdtempSync(join(tmpdir(), "sugo-committed-diff-")); roots.push(root);
    const git = (...args: string[]) => execFileSync("git", args, { cwd: root });
    git("init"); git("config", "user.email", "test@example.invalid"); git("config", "user.name", "Test");
    writeFileSync(join(root, "file.ts"), "old\n"); git("add", ".");
    execFileSync("git", ["commit", "-m", "base"], { cwd: root, env: { ...process.env, GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z", GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z" } });
    const startedAt = new Date(Date.now() - 1000).toISOString();
    writeFileSync(join(root, "file.ts"), "new\n"); git("add", "."); git("commit", "-m", "change");
    const [file] = await snapshotWorkResultFiles(root, ["file.ts"], startedAt);
    expect(file.diff).toContain("+new");
    expect(file.diff).toContain("-old");
  });
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
