import { z } from "zod";
import { routeInput } from "../route.js";

export const sugoRouteInputSchema = {
  input: z.string().describe("자연어 요청(예: '이 버그 좀 고쳐줘', '테스트 좀 돌려줘')"),
};

const SugoRouteArgs = z.object(sugoRouteInputSchema);

/** §5b: 파이프라인 밖 단발 요청의 자연어 의도를 (agent, skill)로 라우팅한다. */
export async function handleSugoRoute(rawArgs: unknown) {
  const args = SugoRouteArgs.parse(rawArgs);
  const result = routeInput(args.input);
  return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, ...result }, null, 2) }] };
}
