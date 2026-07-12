import { z } from "zod";
import { checkLethalTrifecta } from "../lethalTrifecta.js";

export const sugoCheckLethalTrifectaInputSchema = {
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

/** §10: (사설데이터 접근 + 신뢰불가 입력 처리 + 외부통신) 3축 동시 보유 도구를 경고한다. */
export async function handleSugoCheckLethalTrifecta(rawArgs: unknown) {
  const args = SugoCheckLethalTrifectaArgs.parse(rawArgs);
  const warnings = checkLethalTrifecta(args.tools);
  const payload = { ok: true, warnings, safe: warnings.length === 0 };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
