import { z } from "zod";
import { buildChainPrompt, type ChainDirection, type ChainHandoff } from "../chain.js";
import { emitActivity } from "../dashboard/activity.js";
import { loadSession, saveSession, sessionExists } from "../session.js";

export const sugoChainInputSchema = {
  sessionId: z.string().describe("sugo_plan(start)으로 발급된 세션 id"),
  changeType: z.enum(["feature", "bugfix", "refactor"]).describe("이번 변경의 성격"),
  summary: z.string().describe("이전 단계 작업 요약(다음 에이전트에게 넘길 컨텍스트)"),
};

const SugoChainArgs = z.object(sugoChainInputSchema);

/**
 * §5 에이전트 체인 핸드오프. 세션의 현재 상태로 방향(code→test / test→review)을 판단한다.
 * CODE_DONE 이후엔 test-agent 핸드오프, TEST_DONE 이후엔 review-agent 핸드오프를 생성한다.
 */
export async function handleSugoChain(rawArgs: unknown) {
  const args = SugoChainArgs.parse(rawArgs);

  if (!(await sessionExists(args.sessionId))) {
    return errorResult("SESSION_NOT_FOUND", `세션을 찾을 수 없습니다: ${args.sessionId}`);
  }
  const session = await loadSession(args.sessionId);

  let direction: ChainDirection;
  if (session.state === "CODE_DONE") direction = "code_to_test";
  else if (session.state === "TEST_DONE") direction = "test_to_review";
  else {
    return errorResult(
      "CHAIN_WRONG_STATE",
      `sugo_chain은 CODE_DONE(→test-agent) 또는 TEST_DONE(→review-agent) 상태에서만 호출합니다. 현재 상태: ${session.state}`,
    );
  }

  const handoff: ChainHandoff = {
    project: session.projectPath,
    changedFiles: session.data.chainInfo.changedFiles,
    changeType: args.changeType,
    summary: args.summary,
    prdPath: session.data.prdPath,
    sessionId: session.id,
  };
  const prompt = buildChainPrompt(direction, handoff);

  const updated = {
    ...session,
    data: {
      ...session.data,
      chainInfo: {
        ...session.data.chainInfo,
        chainHandoffs: [...(session.data.chainInfo.chainHandoffs ?? []), { direction, calledAt: new Date().toISOString() }],
      },
    },
  };
  await saveSession(updated);

  // ── §7.2 Activity Stream: 워크스페이스에 등록된 세션만 emit(비등록 세션은 대시보드에 보일
  // 워크스페이스 자체가 없으므로 no-op). 논블로킹 — 실패해도 sugo_chain 응답엔 영향 없다.
  if (session.data.hulkWorkspace) {
    const fromAgent = direction === "code_to_test" ? "CODE" : "TEST";
    const toAgent = direction === "code_to_test" ? "TEST" : "REVIEW";
    void emitActivity({
      workspaceName: session.data.hulkWorkspace,
      agent: fromAgent,
      handoffTo: toAgent,
      eventType: "HANDOFF",
      message: args.summary,
    });
  }

  const payload = { ok: true, sessionId: session.id, direction, handoff, prompt };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(errorCode: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode, message }, null, 2) }],
  };
}
