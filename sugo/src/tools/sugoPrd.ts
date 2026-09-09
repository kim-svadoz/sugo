import { z } from "zod";

export const sugoPrdInputSchema = {};

/**
 * §1 `sugo_prd` — **DEPRECATED. 핸들러가 무조건 거부한다.**
 *
 * PRD를 독립 도구로 만들 수 있으면 상태머신을 우회하는 뒷문이 된다. 그렇게 만든 PRD는 세션에
 * 안 붙으니 baseline/analyze/커버리지 게이트를 하나도 안 거치고 로드맵 REQ 승격도 안 된다.
 *
 * **완전히 지우지 않고 거부 스텁으로 남기는 이유:** 도구 자체가 사라지면 호출부가 받는 건
 * "알 수 없는 도구"라는 무의미한 오류뿐이다. 여기 남겨두면 **어디로 가야 하는지**를 알려줄 수 있다.
 */
export async function handleSugoPrd() {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            ok: false,
            errorCode: "TOOL_DEPRECATED",
            message:
              "sugo_prd는 폐기됐습니다. PRD는 파이프라인 안에서만 만들 수 있습니다 — sugo_plan({action:'prd', sessionId, prdContent})를 사용하세요.",
            replacement: "sugo_plan(action:'prd')",
          },
          null,
          2,
        ),
      },
    ],
  };
}
