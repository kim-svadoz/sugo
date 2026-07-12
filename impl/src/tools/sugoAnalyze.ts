import { readFile } from "node:fs/promises";
import { z } from "zod";
import { analyzePrdMatch } from "../analyze.js";
import { readFileContents } from "../readChangedFiles.js";
import { loadSession, saveSession, sessionExists } from "../session.js";

export const sugoAnalyzeInputSchema = {
  sessionId: z.string().describe("sugo_plan(start)으로 발급된 세션 id"),
  changedFiles: z.array(z.string()).describe("PRD 요구사항과 대조할 변경 파일 목록(프로젝트 기준 상대경로 또는 절대경로)"),
};

const SugoAnalyzeArgs = z.object(sugoAnalyzeInputSchema);

/**
 * §4.1 analyze 호출강제의 실제 판정 엔진. code_done의 analyze 게이트는 "호출 이력"만 보지만,
 * 이 도구 자체는 PRD 요구사항과 변경파일을 실제로 대조해 pass/partial/fail을 판정하고
 * session.chainInfo.analyzeAttempts를 서버측에서 증가시킨다(자기보고 analyzePassed:true만으론
 * code_done을 통과할 수 없는 이유 — 호출 이력은 오직 여기서만 기록된다).
 */
export async function handleSugoAnalyze(rawArgs: unknown) {
  const args = SugoAnalyzeArgs.parse(rawArgs);

  if (!(await sessionExists(args.sessionId))) {
    return errorResult("SESSION_NOT_FOUND", `세션을 찾을 수 없습니다: ${args.sessionId}`);
  }
  const session = await loadSession(args.sessionId);

  if (!session.data.prdPath) {
    return errorResult("PRD_NOT_FOUND", "이 세션에는 PRD가 없습니다. sugo_plan(action:'prd')를 먼저 호출하세요.");
  }

  let prdContent: string;
  try {
    prdContent = await readFile(session.data.prdPath, "utf-8");
  } catch {
    return errorResult("PRD_FILE_MISSING", `PRD 파일을 읽을 수 없습니다: ${session.data.prdPath}`);
  }

  const fileContents = await readFileContents(session.projectPath, args.changedFiles);
  const analysis = analyzePrdMatch(prdContent, fileContents);

  const attempts = session.data.chainInfo.analyzeAttempts + 1;
  const updatedSession = {
    ...session,
    data: {
      ...session.data,
      chainInfo: {
        ...session.data.chainInfo,
        analyzeAttempts: attempts,
        analyzeLastVerdict: analysis.verdict,
        analyzePassed: analysis.verdict === "pass",
      },
    },
  };
  await saveSession(updatedSession);

  const payload = {
    ok: true,
    sessionId: session.id,
    attempt: attempts,
    verdict: analysis.verdict,
    requirements: analysis.requirements,
    note:
      attempts >= 3
        ? "self-loop 3회 소진 — verdict와 무관하게 code_done으로 진행 가능합니다(§4.1: 정직히 진행, 진짜 증거는 test로)."
        : undefined,
  };

  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(errorCode: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode, message }, null, 2) }],
  };
}
