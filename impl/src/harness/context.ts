import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DetectionContext } from "./types.js";

export function createFsDetectionContext(projectPath: string): DetectionContext {
  return {
    projectPath,
    fileExists(relPath: string): boolean {
      return existsSync(join(projectPath, relPath));
    },
    readFile(relPath: string): string | null {
      try {
        return readFileSync(join(projectPath, relPath), "utf-8");
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
