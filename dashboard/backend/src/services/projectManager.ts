import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export type ProjectManageInput = { action: "remove"; projectPath: string } | { action: "move"; from: string; to: string };
export interface ProjectRemoveResult { ok: true; projectPath: string; folderMissing: boolean; removedFiles: string[]; workspaces: string[] }
export interface ProjectMoveResult { ok: true; from: string; to: string; workspace: string | null; removedFiles: string[] }
export interface ProjectManager {
  remove(projectPath: string): Promise<ProjectRemoveResult>;
  move(from: string, to: string): Promise<ProjectMoveResult>;
}

async function enginePath(): Promise<string> {
  const candidates = [
    process.env.SUGO_PROJECT_MANAGE_ENGINE,
    fileURLToPath(new URL("../dist/dashboard-project-manage.mjs", import.meta.url)),
    resolve(process.cwd(), "../../sugo/dist/dashboard-project-manage.mjs"),
    resolve(process.cwd(), "sugo/dist/dashboard-project-manage.mjs"),
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) if (await access(candidate).then(() => true, () => false)) return candidate;
  throw Object.assign(new Error("Sugo 프로젝트 관리 엔진을 찾지 못했습니다. 플러그인을 다시 빌드하거나 업데이트하세요."), { code: "PROJECT_MANAGE_ENGINE_UNAVAILABLE" });
}

async function runEngine<T>(input: ProjectManageInput): Promise<T> {
  const script = await enginePath();
  return new Promise((resolveResult, reject) => {
    const child = execFile(process.execPath, [script], { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        let detail: { error?: string; code?: string } = {};
        try { detail = JSON.parse(stderr); } catch { detail = { error: stderr.trim() || error.message }; }
        reject(Object.assign(new Error(detail.error || "프로젝트를 변경하지 못했습니다."), { code: detail.code || "PROJECT_MANAGE_FAILED" }));
        return;
      }
      try { resolveResult(JSON.parse(stdout) as T); }
      catch { reject(Object.assign(new Error("프로젝트 관리 엔진의 응답을 읽지 못했습니다."), { code: "PROJECT_MANAGE_INVALID_RESPONSE" })); }
    });
    child.stdin?.end(JSON.stringify(input));
  });
}

export const engineProjectManager: ProjectManager = {
  remove: (projectPath) => runEngine<ProjectRemoveResult>({ action: "remove", projectPath }),
  move: (from, to) => runEngine<ProjectMoveResult>({ action: "move", from, to }),
};
