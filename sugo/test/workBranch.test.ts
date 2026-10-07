import { execFileSync } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { prepareWorkBranch } from "../src/workBranch.js";

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
}

async function repo() {
  const root = await mkdtemp(join(tmpdir(), "sugo-work-branch-"));
  const remote = join(root, "remote.git");
  const seed = join(root, "seed");
  execFileSync("git", ["init", "--bare", remote]);
  execFileSync("git", ["init", "-b", "main", seed]);
  git(seed, "config", "user.email", "test@example.com");
  git(seed, "config", "user.name", "Test");
  await writeFile(join(seed, "README.md"), "seed\n");
  git(seed, "add", "README.md");
  git(seed, "commit", "-m", "seed");
  git(seed, "remote", "add", "origin", remote);
  git(seed, "push", "-u", "origin", "main");
  execFileSync("git", ["--git-dir", remote, "symbolic-ref", "HEAD", "refs/heads/main"]);
  const work = join(root, "work");
  execFileSync("git", ["clone", remote, work]);
  return { remote, work };
}

describe("prepareWorkBranch", () => {
  it("없는 브랜치를 기본 브랜치에서 만들고 origin에 push한다", async () => {
    const { remote, work } = await repo();
    const result = await prepareWorkBranch(work, "feature/payment");
    expect(result.source).toBe("created");
    expect(git(work, "branch", "--show-current")).toBe("feature/payment");
    expect(execFileSync("git", ["--git-dir", remote, "show-ref", "--verify", "refs/heads/feature/payment"], { encoding: "utf8" })).toContain("feature/payment");
  });

  it("변경 중인 파일이 있으면 브랜치를 바꾸지 않는다", async () => {
    const { work } = await repo();
    await writeFile(join(work, "README.md"), "dirty\n");
    await expect(prepareWorkBranch(work, "feature/payment")).rejects.toMatchObject({ code: "WORKTREE_DIRTY" });
    expect(git(work, "branch", "--show-current")).toBe("main");
  });
});
