import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import { parseFileOutline, supportedLanguages } from "../ast/astParser.js";

const MAX_FILES = 50;
const MAX_FILE_BYTES = 500_000;

export const sugoExploreInputSchema = {
  projectPath: z.string().describe("탐색할 프로젝트 절대경로"),
  filePaths: z.array(z.string()).describe("탐색할 파일 목록(프로젝트 기준 상대경로 또는 절대경로, 최대 50개)"),
};

const SugoExploreArgs = z.object(sugoExploreInputSchema);

/**
 * code-agent 전용 AST 기반 코드베이스 탐색 — 정규식이 아니라 web-tree-sitter로 실제 파싱해
 * 클래스·메서드·함수·import를 추출한다. 코딩 전에 기존 구조를 이해하는 용도.
 */
export async function handleSugoExplore(rawArgs: unknown) {
  const args = SugoExploreArgs.parse(rawArgs);
  const outlines: Awaited<ReturnType<typeof parseFileOutline>>[] = [];
  const skipped: { path: string; reason: string }[] = [];

  for (const f of args.filePaths.slice(0, MAX_FILES)) {
    const full = isAbsolute(f) ? f : join(args.projectPath, f);
    let content: string;
    try {
      content = await readFile(full, "utf-8");
    } catch {
      skipped.push({ path: f, reason: "파일을 읽을 수 없음" });
      continue;
    }
    if (content.length > MAX_FILE_BYTES) {
      skipped.push({ path: f, reason: "파일이 너무 큼(500KB 초과)" });
      continue;
    }
    const outline = await parseFileOutline(f, content);
    if (!outline) {
      skipped.push({ path: f, reason: `지원하지 않는 언어(지원: ${supportedLanguages().join(", ")})` });
      continue;
    }
    outlines.push(outline);
  }

  const payload = { ok: true, outlines, skipped };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
