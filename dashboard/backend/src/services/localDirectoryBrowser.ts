import { homedir } from "node:os";
import { readdir, realpath } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative } from "node:path";

const PROJECT_MARKERS = new Set([".git", "package.json", "pom.xml", "build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts", "pyproject.toml", "requirements.txt", "Cargo.toml", "go.mod", "composer.json", "Gemfile", "Makefile", "src"]);

export interface LocalDirectoryEntry { name: string; path: string; projectLike: boolean; signals: string[]; }

export async function inspectProjectDirectory(path: string): Promise<{ path: string; name: string; projectLike: boolean; signals: string[] }> {
  const current = await realpath(path);
  const entries = await readdir(current, { withFileTypes: true });
  const names = new Set(entries.map((entry) => entry.name));
  const signals = [...PROJECT_MARKERS].filter((marker) => names.has(marker));
  return { path: current, name: basename(current), projectLike: signals.length > 0, signals };
}

function assertInsideHome(path: string, home: string): void {
  const rel = relative(home, path);
  if (rel === ".." || rel.startsWith("../") || rel.startsWith("..\\") || isAbsolute(rel)) {
    throw Object.assign(new Error("홈 디렉터리 밖의 경로는 탐색할 수 없습니다."), { code: "DIRECTORY_OUTSIDE_HOME" });
  }
}

export async function inspectLocalDirectory(inputPath?: string, allowedHome = homedir()): Promise<{ path: string; parentPath: string | null; name: string; projectLike: boolean; signals: string[]; directories: LocalDirectoryEntry[] }> {
  const home = await realpath(allowedHome);
  const current = await realpath(inputPath || home);
  assertInsideHome(current, home);
  const entries = await readdir(current, { withFileTypes: true });
  const names = new Set(entries.map((entry) => entry.name));
  const signals = [...PROJECT_MARKERS].filter((marker) => names.has(marker));
  const directories = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules")
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(async (entry) => {
      const path = join(current, entry.name);
      const children = await readdir(path, { withFileTypes: true }).catch(() => []);
      const childNames = new Set(children.map((child) => child.name));
      const childSignals = [...PROJECT_MARKERS].filter((marker) => childNames.has(marker));
      return { name: entry.name, path, projectLike: childSignals.length > 0, signals: childSignals };
    }));
  return { path: current, parentPath: current === home ? null : dirname(current), name: basename(current), projectLike: signals.length > 0, signals, directories };
}
