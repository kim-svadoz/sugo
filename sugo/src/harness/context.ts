import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import type { DetectionContext } from "./types.js";

/** relPath가 이미 절대경로면 그대로, 아니면 projectPath 기준으로 합친다(§P6-2: changedFiles가
 * 절대경로로 올 수도 있어서 — statChangedFiles/fingerprint.ts와 같은 판정). */
function resolvePath(projectPath: string, relPath: string): string {
  return isAbsolute(relPath) ? relPath : join(projectPath, relPath);
}

export function createFsDetectionContext(projectPath: string, changedFiles: string[] = []): DetectionContext {
  return {
    projectPath,
    changedFiles,
    fileExists(relPath: string): boolean {
      return existsSync(resolvePath(projectPath, relPath));
    },
    readFile(relPath: string): string | null {
      try {
        return readFileSync(resolvePath(projectPath, relPath), "utf-8");
      } catch {
        return null;
      }
    },
    readJson<T = unknown>(relPath: string): T | null {
      const raw = this.readFile(relPath);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
  };
}
