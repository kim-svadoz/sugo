import { execFile } from "node:child_process";
import { promisify } from "node:util";

const runFile = promisify(execFile);

export class WorkBranchError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

async function git(projectPath: string, args: string[]): Promise<string> {
  try {
    const { stdout } = await runFile("git", ["-C", projectPath, ...args], { encoding: "utf8" });
    return stdout.trim();
  } catch (error) {
    const stderr = error instanceof Error && "stderr" in error ? String((error as Error & { stderr?: string }).stderr ?? "") : "";
    throw new WorkBranchError("WORK_BRANCH_GIT_FAILED", stderr.trim() || `git ${args[0]} 실패`);
  }
}

async function refExists(projectPath: string, ref: string): Promise<boolean> {
  try {
    await runFile("git", ["-C", projectPath, "show-ref", "--verify", "--quiet", ref]);
    return true;
  } catch { return false; }
}

export interface WorkBranchResult {
  name: string;
  source: "local" | "remote" | "created";
  remoteCreated: boolean;
  preparedAt: string;
}

export async function prepareWorkBranch(projectPath: string, name: string): Promise<WorkBranchResult> {
  try {
    await runFile("git", ["check-ref-format", "--branch", name]);
  } catch {
    throw new WorkBranchError("WORK_BRANCH_INVALID", `올바른 Git 브랜치 이름이 아닙니다: ${name}`);
  }
  const dirty = await git(projectPath, ["status", "--porcelain"]);
  if (dirty) throw new WorkBranchError("WORKTREE_DIRTY", "변경 중인 파일이 있어 브랜치를 바꾸지 않습니다. 먼저 커밋하거나 stash하세요.");
  if (!(await git(projectPath, ["remote"]).then((v) => v.split(/\s+/).includes("origin")))) {
    throw new WorkBranchError("WORK_BRANCH_ORIGIN_MISSING", "origin 원격 저장소가 없어 작업 브랜치를 준비할 수 없습니다.");
  }
  await git(projectPath, ["fetch", "origin", "--prune"]);
  const local = await refExists(projectPath, `refs/heads/${name}`);
  const remote = await refExists(projectPath, `refs/remotes/origin/${name}`);
  if (local) {
    await git(projectPath, ["checkout", name]);
    if (remote) {
      try { await git(projectPath, ["merge", "--ff-only", `origin/${name}`]); }
      catch { throw new WorkBranchError("WORK_BRANCH_DIVERGED", `${name}의 로컬과 원격 이력이 갈라져 자동 병합하지 않습니다.`); }
    } else {
      await git(projectPath, ["push", "--set-upstream", "origin", name]);
    }
    return { name, source: "local", remoteCreated: !remote, preparedAt: new Date().toISOString() };
  }
  if (remote) {
    await git(projectPath, ["checkout", "-b", name, "--track", `origin/${name}`]);
    return { name, source: "remote", remoteCreated: false, preparedAt: new Date().toISOString() };
  }
  let defaultRef: string;
  try { defaultRef = await git(projectPath, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]); }
  catch { throw new WorkBranchError("WORK_BRANCH_BASE_UNKNOWN", "origin의 기본 브랜치를 확인할 수 없습니다."); }
  await git(projectPath, ["checkout", "-b", name, defaultRef]);
  await git(projectPath, ["push", "--set-upstream", "origin", name]);
  return { name, source: "created", remoteCreated: true, preparedAt: new Date().toISOString() };
}
