import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { DbClient } from "../db/client.js";

/** 작업 이름(feature 폴더 이름)으로 쓸 수 있는 값. 경로 구분자나 `.`·`..`가 들어오지 않게 한다. */
const TASK_NAME = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,120}$/;

const isDirectory = (path: string) => stat(path).then((info) => info.isDirectory(), () => false);

/**
 * 예전 활동 기록에는 프로젝트 경로가 없다. 작업은 `<프로젝트>/sugo/features/[<날짜>/]<작업 이름>`에 남으므로
 * 그 폴더가 있는 프로젝트를 작업의 프로젝트로 본다. 없으면 null이다(추정하지 않는다).
 */
export async function findTaskProject(projectPaths: readonly string[], taskName: string): Promise<string | null> {
  if (!TASK_NAME.test(taskName)) return null;
  for (const projectPath of projectPaths) {
    const features = join(projectPath, "sugo", "features");
    if (await isDirectory(join(features, taskName))) return projectPath;
    const groups = await readdir(features, { withFileTypes: true }).catch(() => []);
    for (const group of groups) {
      if (group.isDirectory() && await isDirectory(join(features, group.name, taskName))) return projectPath;
    }
  }
  return null;
}

/** 이 사용자 도메인에 등록된 프로젝트 안에서만 찾는다. */
export async function resolveTaskProjects(db: DbClient, userId: string, workspaceName: string, taskNames: readonly string[]): Promise<Record<string, string>> {
  const rows = await db.query<{ project_path: string }>(
    "SELECT p.project_path FROM sugo_workspace_projects p JOIN sugo_workspaces w ON w.id = p.workspace_id WHERE w.user_id = ? AND w.name = ? ORDER BY p.project_path",
    [userId, workspaceName],
  );
  const paths = rows.map((row) => row.project_path);
  const found: Record<string, string> = {};
  for (const name of new Set(taskNames)) {
    const project = await findTaskProject(paths, name);
    if (project) found[name] = project;
  }
  return found;
}
