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
 * §4.1 analyze 호출 기록과 비차단 어휘 진단을 만든다. pass/partial/fail은 PRD 단어와 변경 파일
 * 문자열의 겹침만 뜻하며 요구사항 충족 판정이 아니다. code_done은 서버가 남긴 호출 이력만 본다.
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
        // 호출 계약의 성공 여부다. 어휘 일치 verdict는 analyzeLastVerdict에 별도 보존한다.
        analyzePassed: true,
      },
    },
  };
  await saveSession(updatedSession);

  const payload = {
    ok: true,
    sessionId: session.id,
    attempt: attempts,
    verdict: analysis.verdict,
    lexicalVerdict: analysis.verdict,
    method: "lexical-keyword-overlap",
    blocking: false,
    nextAction: "code_done",
    requirements: analysis.requirements,
    note: "이 verdict는 PRD 단어와 변경 파일의 문자열 겹침을 보여주는 비차단 진단입니다. 한글·영문 의미 동치를 판단하지 않습니다. verdict를 맞추려고 주석이나 이름을 바꾸지 마세요. 실제 동작은 테스트와 review에서 검증하세요.",
  };

  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(errorCode: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode, message }, null, 2) }],
  };
}
