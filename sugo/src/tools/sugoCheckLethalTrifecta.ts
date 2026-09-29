import { z } from "zod";
import { checkLethalTrifecta } from "../lethalTrifecta.js";
import { loadSession, saveSession, sessionExists } from "../session.js";

export const sugoCheckLethalTrifectaInputSchema = {
  sessionId: z
    .string()
    .describe(
      "sugo_plan(start)으로 발급된 세션 id. §P6-1: review_done 전에 이 도구를 최소 1회 호출해야 " +
        "하는 하드 게이트(LETHAL_TRIFECTA_NOT_CALLED)의 대상이라, 세션에 호출 기록을 남긴다.",
    ),
  tools: z
    .array(
      z.object({
        toolName: z.string(),
        accessesPrivateData: z.boolean(),
        processesUntrustedInput: z.boolean(),
        communicatesExternally: z.boolean(),
      }),
    )
    .describe(
      "점검할 도구 목록. capability는 호출자(에이전트)가 실제로 알고 있는 값을 명시적으로 넣어야 " +
        "한다 — 이 도구는 이름/설명에서 자동으로 추측하지 않는다(신뢰 못할 휴리스틱 방지).",
    ),
};

const SugoCheckLethalTrifectaArgs = z.object(sugoCheckLethalTrifectaInputSchema);

/**
 * §10 + §P6-1: (사설데이터 접근 + 신뢰불가 입력 처리 + 외부통신) 3축 동시 보유 도구를 경고하고,
 * 호출 사실과 경고를 세션에 기록한다. review_done의 checkLethalTrifectaCalledGate/
 * checkLethalTrifectaMitigationGate(§gates.ts)가 이 기록을 본다 — sugo_validate와 같은 이유로,
 * 매 review마다 호출 자체를 강제해야 opt-in 스킬 트리거 누락으로 트리펙타 점검이 조용히 생략되는
 * 걸 막을 수 있다.
 */
export async function handleSugoCheckLethalTrifecta(rawArgs: unknown) {
  const args = SugoCheckLethalTrifectaArgs.parse(rawArgs);

  if (!(await sessionExists(args.sessionId))) {
    return errorResult("SESSION_NOT_FOUND", `세션을 찾을 수 없습니다: ${args.sessionId}`);
  }
  const session = await loadSession(args.sessionId);

  const warnings = checkLethalTrifecta(args.tools);

  const updated = {
    ...session,
    data: {
      ...session.data,
      chainInfo: {
        ...session.data.chainInfo,
        lastLethalTrifectaCheck: {
          checkedAt: new Date().toISOString(),
          warnings,
        },
      },
    },
  };
  await saveSession(updated);

  const payload = { ok: true, sessionId: session.id, warnings, safe: warnings.length === 0 };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(errorCode: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode, message }, null, 2) }],
  };
}
