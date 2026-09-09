import { readFile } from "node:fs/promises";
import { relative, sep } from "node:path";
import { z } from "zod";
import { parseFileOutline, supportedLanguages } from "../ast/astParser.js";
import { walkSourceFiles } from "../overview.js";

const MAX_FILES = 200;
const MAX_FILE_BYTES = 500_000;

export const sugoOverviewInputSchema = {
  projectPath: z.string().describe("온보딩할 프로젝트 절대경로"),
};

const SugoOverviewArgs = z.object(sugoOverviewInputSchema);

/**
 * §9/§D.7 sugo_overview: sugo_explore(파일 목록을 직접 지정)와 달리, 프로젝트 전체를 스스로
 * 걸어(walkSourceFiles) tree-sitter로 파싱한다 — "구조 온보딩"용 한방 스캔. 최대 200개 파일까지만
 * (그 이상은 sugo_explore로 필요한 파일만 골라 보는 게 낫다 — 토큰 폭발 방지).
 */
export async function handleSugoOverview(rawArgs: unknown) {
  const args = SugoOverviewArgs.parse(rawArgs);
  const files = await walkSourceFiles(args.projectPath, MAX_FILES);

  const outlines: Awaited<ReturnType<typeof parseFileOutline>>[] = [];
  const skipped: { path: string; reason: string }[] = [];

  for (const full of files) {
    // relative()는 플랫폼 구분자를 쓴다(Windows `src\a.ts` / mac `src/a.ts`). 이 경로는 그대로
    // 도구 출력에 실려 에이전트가 읽고 다시 인용하므로, 같은 프로젝트면 어느 OS에서든 같은
    // 문자열이 나오도록 POSIX 구분자로 통일한다(§D.7 출력은 플랫폼 중립).
    const relPath = relative(args.projectPath, full).split(sep).join("/");
    let content: string;
    try {
      content = await readFile(full, "utf-8");
    } catch {
      skipped.push({ path: relPath, reason: "파일을 읽을 수 없음" });
      continue;
    }
    if (content.length > MAX_FILE_BYTES) {
      skipped.push({ path: relPath, reason: "파일이 너무 큼(500KB 초과)" });
      continue;
    }
    const outline = await parseFileOutline(relPath, content);
    if (!outline) {
      skipped.push({ path: relPath, reason: `지원하지 않는 언어(지원: ${supportedLanguages().join(", ")})` });
      continue;
    }
    outlines.push(outline);
  }

  const payload = {
    ok: true,
    projectPath: args.projectPath,
    scannedFileCount: files.length,
    truncated: files.length >= MAX_FILES,
    outlines,
    skipped,
  };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
