import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

const MAX_FILE_BYTES = 300_000;
const MAX_FILES = 200;

/** changedFiles(상대/절대 경로 혼용 가능)를 읽어 텍스트 콘텐츠 배열로 반환. 없거나 바이너리/과대 파일은 스킵(best-effort). */
export async function readFileContents(projectPath: string, changedFiles: string[]): Promise<string[]> {
  const contents: string[] = [];
  for (const rel of changedFiles.slice(0, MAX_FILES)) {
    const full = isAbsolute(rel) ? rel : join(projectPath, rel);
    try {
      const content = await readFile(full, "utf-8");
      if (content.length <= MAX_FILE_BYTES) contents.push(content);
    } catch {
      continue;
    }
  }
  return contents;
}
