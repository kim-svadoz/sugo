import { z } from "zod";
import { loadSession, sessionExists } from "../session.js";

export const sugoCommitInputSchema = {
  sessionId: z.string().describe("DONE 상태의 세션 id — 커밋 메시지는 그 세션의 작업에서 나온다"),
  type: z.string().describe("Conventional Commit type(feat/fix/refactor/test/docs/chore …)"),
  scope: z.string().optional().describe("영향 범위(선택)"),
  subject: z.string().describe("한 줄 제목(한국어)"),
  body: z.string().optional().describe("본문(한국어) — 왜 이렇게 했는지"),
  jiraKey: z.string().optional().describe("연결된 Jira 티켓 키(있으면 꼬리말에 붙는다)"),
  includeTime: z.boolean().optional().describe("started_at→done 소요시간을 꼬리말에 넣을지"),
};

const SugoCommitArgs = z.object(sugoCommitInputSchema);

/**
 * §7 `sugo_commit` — Conventional Commit **메시지를 만들어 돌려준다.**
 *
 * **저장소를 실제로 바꾸지 않는다.** 스펙 표의 범위도 `in(생성만)`이다. 커밋은 되돌리기 어려운
 * 행위라 "무엇을 남길지" 판단까지만 하고 실행은 사람에게 넘긴다
 * (§7 "push 금지(사용자 직접)"와 같은 이유).
 *
 * **DONE 상태에서만** 동작한다(§7) — 파이프라인을 다 통과하지 않은 작업에 메시지를 만들어주면
 * 게이트를 건너뛴 채 기록을 남길 길이 생긴다.
 */
export async function handleSugoCommit(rawArgs: unknown) {
  const args = SugoCommitArgs.parse(rawArgs);

  if (!(await sessionExists(args.sessionId))) {
    return errorResult("SESSION_NOT_FOUND", `세션을 찾을 수 없습니다: ${args.sessionId}`);
  }
  const session = await loadSession(args.sessionId);
  if (session.state !== "DONE") {
    return errorResult(
      "COMMIT_REQUIRES_DONE",
      `sugo_commit은 DONE 상태에서만 가능합니다(현재: ${session.state}). sugo_plan(action:'commit')으로 파이프라인을 먼저 끝내세요.`,
    );
  }

  const header = `${args.type}${args.scope ? `(${args.scope})` : ""}: ${args.subject}`;
  const footerParts: string[] = [];
  if (args.jiraKey) footerParts.push(`Refs: ${args.jiraKey}`);
  if (args.includeTime) {
    const started = new Date(session.startedAt).getTime();
    const minutes = Math.max(0, Math.round((Date.now() - started) / 60000));
    footerParts.push(`AI-Execution-Minutes: ${minutes}`);
  }

  const message = [header, args.body?.trim(), footerParts.join("\n")].filter((p) => p && p.length > 0).join("\n\n");

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            ok: true,
            message,
            executed: false,
            note:
              "메시지만 생성했습니다 — 이 도구는 저장소를 건드리지 않습니다(§7 '생성만'). " +
              "실제 기록은 화이트리스트 경로만 스테이징해 사용자가 직접 수행합니다.",
          },
          null,
          2,
        ),
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
