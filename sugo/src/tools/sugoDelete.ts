import { resolve } from "node:path";
import { z } from "zod";
import { removeProjectFromWorkspaces } from "../work/workspace.js";
import { unregisterProject } from "../harness/registry.js";

export const sugoDeleteInputSchema = {
  projectPath: z.string().describe("등록 취소할 프로젝트의 절대경로"),
};

const SugoDeleteArgs = z.object(sugoDeleteInputSchema);

/**
 * §9 라이프사이클 sugo_delete: **레지스트리에서 등록만 취소한다 — 프로젝트의 실제 파일(sugo/**)은
 * 지우지 않는다.** "삭제"라는 이름과 달리 파일시스템 삭제가 아니다(사용자 프로젝트를 실수로
 * 날리는 위험을 피하기 위한 의도적 축소 — harness/registry.ts의 unregisterProject 주석 참고).
 *
 * 등록 해제는 워크스페이스 멤버십까지 함께 푼다. 레지스트리에서만 빼면 등록돼 있지도 않은 경로가
 * `sugo_workspace(get)`에 계속 남고, 빼는 경로가 없어 `workspace.json`을 손으로 고쳐야 했다.
 */
export async function handleSugoDelete(rawArgs: unknown) {
  const args = SugoDeleteArgs.parse(rawArgs);
  const projectPath = resolve(args.projectPath);
  const removed = await unregisterProject(projectPath);
  if (!removed) {
    return errorResult("PROJECT_NOT_REGISTERED", `등록된 프로젝트가 아닙니다: ${projectPath}`);
  }
  const removedFromWorkspaces = await removeProjectFromWorkspaces(projectPath);
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ ok: true, projectPath, removedFromRegistry: true, removedFromWorkspaces }, null, 2),
      },
    ],
  };
}

function errorResult(errorCode: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode, message }, null, 2) }],
  };
}
