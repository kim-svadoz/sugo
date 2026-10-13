import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { backfillWorkspaceGitHistory } from "../src/work/gitHistory.js";

const roots: string[] = [];
afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe("workspace Git history backfill", () => {
  it("등록 프로젝트 경로의 커밋만 파이프라인 외부 이력으로 저장한다", async () => {
    const home = mkdtempSync(join(tmpdir(), "sugo-git-history-home-"));
    const repo = mkdtempSync(join(tmpdir(), "sugo-git-history-repo-"));
    roots.push(home, repo);
    process.env.SUGO_HOME_OVERRIDE = home;
    execFileSync("git", ["init"], { cwd: repo });
    execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: repo });
    execFileSync("git", ["config", "user.name", "Test"], { cwd: repo });
    mkdirSync(join(repo, "dashboard"));
    mkdirSync(join(repo, "other"));
    writeFileSync(join(repo, "dashboard", "memo.ts"), "export const memo = true;\n");
    execFileSync("git", ["add", "dashboard/memo.ts"], { cwd: repo });
    execFileSync("git", ["commit", "-m", "feat: add schedule memo"], { cwd: repo });
    writeFileSync(join(repo, "other", "ignored.ts"), "ignored\n");
    execFileSync("git", ["add", "other/ignored.ts"], { cwd: repo });
    execFileSync("git", ["commit", "-m", "chore: unrelated"], { cwd: repo });

    const logs = await backfillWorkspaceGitHistory({ name: "inventory", projects: [join(repo, "dashboard")], created_at: "2000-01-01T00:00:00.000Z" });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ task_title: "feat: add schedule memo", summary: "Sugo 파이프라인 외부에서 수행한 Git 저장소 이력입니다." });
    expect(logs[0].files_changed).toEqual(["dashboard/memo.ts"]);
    expect(JSON.parse(readFileSync(join(home, ".claude", "sugo", "work", "inventory", "history", `${logs[0].id}.json`), "utf8"))).toMatchObject({ task_title: "feat: add schedule memo" });
  });
});
