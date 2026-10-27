import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export interface ProjectRegistrationInput { projectPath: string; workspace: string; }
export interface ProjectRegistrationResult {
  ok: true;
  projectPath: string;
  projectName: string;
  workspace: string;
  detectedStack: unknown;
  appliedHarnesses: unknown[];
  warnings: string[];
}
export type ProjectRegistrar = (input: ProjectRegistrationInput) => Promise<ProjectRegistrationResult>;

async function registrarPath(): Promise<string> {
  const configured = process.env.SUGO_PROJECT_REGISTRAR_PATH;
  const candidates = [
    configured,
    fileURLToPath(new URL("../dist/dashboard-register.mjs", import.meta.url)),
    resolve(process.cwd(), "../../sugo/dist/dashboard-register.mjs"),
    resolve(process.cwd(), "sugo/dist/dashboard-register.mjs"),
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (await access(candidate).then(() => true, () => false)) return candidate;
  }
  throw Object.assign(new Error("Sugo 프로젝트 등록 엔진을 찾지 못했습니다. 플러그인을 다시 빌드하거나 업데이트하세요."), { code: "PROJECT_REGISTRAR_UNAVAILABLE" });
}

export const runProjectRegistrar: ProjectRegistrar = async (input) => {
  const script = await registrarPath();
  return new Promise((resolveResult, reject) => {
    const child = execFile(process.execPath, [script], { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        let detail: { error?: string; code?: string } = {};
        try { detail = JSON.parse(stderr); } catch { detail = { error: stderr.trim() || error.message }; }
        reject(Object.assign(new Error(detail.error || "프로젝트 등록에 실패했습니다."), { code: detail.code || "PROJECT_REGISTRATION_FAILED" }));
        return;
      }
      try { resolveResult(JSON.parse(stdout) as ProjectRegistrationResult); }
      catch { reject(Object.assign(new Error("프로젝트 등록 엔진의 응답을 읽지 못했습니다."), { code: "PROJECT_REGISTRAR_INVALID_RESPONSE" })); }
    });
    child.stdin?.end(JSON.stringify(input));
  });
};
