import { execFile } from "node:child_process";
import { mkdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { atomicWriteFile } from "../fsUtil.js";
import { historyDir } from "./storage.js";
import type { WorkLog, Workspace } from "./types.js";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  try { return (await execFileAsync("git", args, { cwd, encoding: "utf8", maxBuffer: 20_000_000 })).stdout.trim(); }
  catch { return ""; }
}

interface RepositoryScope { root: string; paths: string[] }

async function repositoryScopes(projects: string[]): Promise<RepositoryScope[]> {
  const byRoot = new Map<string, Set<string>>();
  for (const project of projects) {
    const root = await git(project, ["rev-parse", "--show-toplevel"]);
    if (!root) continue;
    const [canonicalRoot, canonicalProject] = await Promise.all([realpath(resolve(root)), realpath(resolve(project))]);
    const rel = relative(canonicalRoot, canonicalProject);
    if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) continue;
    const paths = byRoot.get(root) ?? new Set<string>();
    paths.add(rel ? rel.split(sep).join("/") : ".");
    byRoot.set(canonicalRoot, paths);
  }
  return [...byRoot].map(([root, paths]) => ({ root, paths: [...paths] }));
}

/** 등록 프로젝트에서 발생한 Git 커밋을 파이프라인 증거가 아닌 저장소 이력으로 보강한다. */
export async function backfillWorkspaceGitHistory(workspace: Workspace): Promise<WorkLog[]> {
  const logs: WorkLog[] = [];
  for (const scope of await repositoryScopes(workspace.projects)) {
    const lines = (await git(scope.root, ["log", `--since=${workspace.created_at}`, "--format=%H%x09%cI%x09%s", "--", ...scope.paths])).split("\n").filter(Boolean);
    for (const line of lines) {
      const [sha, completedAt, ...subjectParts] = line.split("\t");
      if (!/^[0-9a-f]{40}$/i.test(sha) || !completedAt) continue;
      const files = (await git(scope.root, ["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", sha, "--", ...scope.paths])).split("\n").filter(Boolean);
      logs.push({
        id: `git-${sha}`,
        task_id: `git:${sha.slice(0, 12)}`,
        task_title: subjectParts.join("\t") || sha.slice(0, 12),
        completed_at: completedAt,
        summary: "Sugo 파이프라인 외부에서 수행한 Git 저장소 이력입니다.",
        files_changed: files,
        commits: [sha],
      });
    }
  }
  const unique = [...new Map(logs.map((log) => [log.id, log])).values()];
  await mkdir(historyDir(workspace.name), { recursive: true });
  await Promise.all(unique.map((log) => atomicWriteFile(join(historyDir(workspace.name), `${log.id}.json`), JSON.stringify(log, null, 2))));
  return unique;
}
