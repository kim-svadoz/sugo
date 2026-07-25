import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { detectLanguage } from "./ast/astParser.js";

const IGNORED_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "coverage",
  "sugo",
  ".claude",
]);

/**
 * §D.7/sugo_overview: 프로젝트 전체를 재귀 스캔해 tree-sitter가 다루는 언어의 소스파일 경로를
 * 모은다. glob 같은 별도 의존성을 추가하는 대신 node:fs만으로 직접 걷는다(§D.1 완전 자체포함
 * 번들 원칙 — 새 npm 의존성은 번들 크기/esbuild 배너 문제를 다시 불러올 수 있어 피했다).
 * `.`으로 시작하는 디렉터리(.git 등)와 흔한 산출물 디렉터리는 건너뛴다. maxFiles에 도달하면 중단.
 */
export async function walkSourceFiles(rootDir: string, maxFiles: number): Promise<string[]> {
  const results: string[] = [];

  async function walk(dir: string): Promise<void> {
    if (results.length >= maxFiles) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || IGNORED_DIR_NAMES.has(entry.name)) continue;
        await walk(join(dir, entry.name));
      } else if (entry.isFile() && detectLanguage(entry.name)) {
        results.push(join(dir, entry.name));
      }
    }
  }

  await walk(rootDir);
  return results;
}
