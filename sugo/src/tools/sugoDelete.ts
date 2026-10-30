import { resolve } from "node:path";
import { z } from "zod";
import { removeSugoProject } from "../projectLifecycle.js";

export const sugoDeleteInputSchema = {
  projectPath: z.string().describe("등록 취소할 프로젝트의 절대경로"),
};

const SugoDeleteArgs = z.object(sugoDeleteInputSchema);

/**
 * 라이프사이클 sugo_delete: 등록과 워크스페이스 멤버십을 풀고, 프로젝트에서 자동으로 읽히는 Sugo 파일
 * (`.claude/rules/`의 Sugo 규칙, CLAUDE.md·AGENTS.md의 Sugo 블록, sugo/harness·config·CLAUDE.md)만 지운다.
 * PRD·스펙·작업 결과 같은 작업 기록은 남긴다. 폴더가 이미 없으면 등록만 푼다.
 */
export async function handleSugoDelete(rawArgs: unknown) {
  const args = SugoDeleteArgs.parse(rawArgs);
  const projectPath = resolve(args.projectPath);
  try {
    const result = await removeSugoProject(projectPath);
    return { content: [{ type: "text" as const, text: JSON.stringify({ ...result, removedFromRegistry: true, removedFromWorkspaces: result.workspaces }, null, 2) }] };
  } catch (error) {
    if ((error as { code?: string }).code === "PROJECT_NOT_REGISTERED") return errorResult("PROJECT_NOT_REGISTERED", `등록된 프로젝트가 아닙니다: ${projectPath}`);
    throw error;
  }
}

function errorResult(errorCode: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode, message }, null, 2) }],
  };
}
