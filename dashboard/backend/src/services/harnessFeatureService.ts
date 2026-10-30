import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export interface HarnessFeatureState { enabled: boolean; projectCount?: number }
export type HarnessFeatureUpdater = (enabled: boolean) => Promise<HarnessFeatureState>;

export async function loadHarnessFeatureState(path: string): Promise<HarnessFeatureState> {
  try {
    const value = JSON.parse(await readFile(path, "utf8")) as Partial<HarnessFeatureState>;
    return { enabled: value.enabled !== false };
  } catch {
    return { enabled: true };
  }
}

async function enginePath(): Promise<string> {
  const candidates = [
    process.env.SUGO_HARNESS_FEATURE_ENGINE,
    fileURLToPath(new URL("../dist/dashboard-harness-feature.mjs", import.meta.url)),
    resolve(process.cwd(), "../../sugo/dist/dashboard-harness-feature.mjs"),
    resolve(process.cwd(), "sugo/dist/dashboard-harness-feature.mjs"),
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) if (await access(candidate).then(() => true, () => false)) return candidate;
  throw Object.assign(new Error("Sugo 하네스 설정 엔진을 찾지 못했습니다. 플러그인을 다시 빌드하거나 업데이트하세요."), { code: "HARNESS_FEATURE_ENGINE_UNAVAILABLE" });
}

export const updateHarnessFeature: HarnessFeatureUpdater = async (enabled) => {
  const script = await enginePath();
  return new Promise((resolveResult, reject) => {
    const child = execFile(process.execPath, [script], { timeout: 120_000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        let detail: { error?: string; code?: string } = {};
        try { detail = JSON.parse(stderr); } catch { detail = { error: stderr.trim() || error.message }; }
        reject(Object.assign(new Error(detail.error || "하네스 설정을 적용하지 못했습니다."), { code: detail.code || "HARNESS_FEATURE_UPDATE_FAILED" }));
        return;
      }
      try { resolveResult(JSON.parse(stdout) as HarnessFeatureState); }
      catch { reject(Object.assign(new Error("하네스 설정 엔진의 응답을 읽지 못했습니다."), { code: "HARNESS_FEATURE_INVALID_RESPONSE" })); }
    });
    child.stdin?.end(JSON.stringify({ enabled }));
  });
};
