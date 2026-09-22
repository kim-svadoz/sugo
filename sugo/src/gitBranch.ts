import { runGit } from "./prRefs.js";

/** git 저장소가 아니거나 detached HEAD 등으로 브랜치를 못 읽으면 null(no-op) — 막지 않는다. */
export async function currentGitBranch(projectPath: string): Promise<string | null> {
  const branch = await runGit(["rev-parse", "--abbrev-ref", "HEAD"], projectPath);
  if (!branch || branch === "HEAD") return null;
  return branch;
}

/** `feature/<이름>` 패턴에서 `<이름>`만 뽑는다. 패턴이 아니면 null. */
export function featureBranchName(branch: string | null): string | null {
  if (!branch) return null;
  const m = branch.match(/^feature\/(.+)$/);
  return m ? m[1] : null;
}
