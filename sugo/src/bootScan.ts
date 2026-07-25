import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { hasValidSpringBootTestAnnotation } from "./gates.js";

const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "build", "target", "out", ".gradle", "sugo"]);
const MAX_FILES = 2000;
const MAX_FILE_BYTES = 300_000;

async function collectJavaFiles(dir: string, acc: string[]): Promise<void> {
  if (acc.length >= MAX_FILES) return;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (acc.length >= MAX_FILES) return;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      await collectJavaFiles(join(dir, entry.name), acc);
    } else if (entry.isFile() && entry.name.endsWith(".java")) {
      acc.push(join(dir, entry.name));
    }
  }
}

/**
 * §4.1 boot-gate 실측 스캔: 자기보고가 아니라 실제 .java 파일을 걸어서 @SpringBootTest
 * 어노테이션(줄 첫 비공백)이 있는지 확인한다. *Test.java/*Tests.java/*IT.java를 우선 스캔하고,
 * 그런 파일이 하나도 없으면(네이밍 컨벤션이 다를 수 있어) 전체 .java로 폴백한다.
 */
export async function scanForSpringBootTestAnnotation(projectPath: string): Promise<boolean> {
  const files: string[] = [];
  await collectJavaFiles(projectPath, files);

  const testFiles = files.filter((f) => /(Test|Tests|IT)\.java$/.test(f));
  const candidates = testFiles.length > 0 ? testFiles : files;

  for (const file of candidates) {
    try {
      const content = await readFile(file, "utf-8");
      if (content.length > MAX_FILE_BYTES) continue;
      if (hasValidSpringBootTestAnnotation([content])) return true;
    } catch {
      continue;
    }
  }
  return false;
}
