import { z } from "zod";
import { BOUNDARIES, INVARIANTS, ONTOLOGY, type OntologyView } from "../ontology/model.js";
import { ALLOWED_ACTIONS_BY_STATE, PREREQUISITES, RESULT_STATE } from "../ontology/derive.js";

const VIEWS = [
  "objectTypes",
  "allStatuses",
  "linkTypes",
  "workflowStates",
  "actionTypes",
  "startStates",
  "cancellableStates",
  "ownership",
  "invariants",
  "boundaries",
] as const satisfies readonly OntologyView[];

export const sugoOntologyInputSchema = {
  view: z
    .enum(VIEWS)
    .optional()
    .describe("조회할 섹션. 생략하면 전체 모델 + 파생 테이블을 반환한다"),
  boundary: z
    .string()
    .optional()
    .describe("결함 표면 이름(handoff|sync|lifecycle|workflow). 해당 경계와 거기 걸린 불변식을 함께 반환한다"),
};

const SugoOntologyArgs = z.object(sugoOntologyInputSchema);

/**
 * §2 `sugo_ontology(view, boundary)` — 온톨로지 런타임 조회(readOnly).
 *
 * **왜 도구로 노출하나:** 모델이 소스에만 있으면 이 파이프라인을 실제로 운전하는 LLM은 그걸 못
 * 본다. "지금 상태에서 뭘 부를 수 있나", "이 경계에서 뭘 지켜야 하나"를 물어볼 수 있어야 게이트에
 * 부딪히며 헤매지 않는다. `boundary`는 그 표면의 계약 + 걸린 불변식을 묶어 돌려준다 —
 * 코드를 고치기 전에 "이 이음새에서 깨지면 안 되는 게 뭔지"를 한 번에 읽으라는 뜻이다.
 *
 * 파생 테이블(prerequisites/allowedActionsByState/resultState)도 함께 실어 보낸다. 선언만 주면
 * 호출자가 파생 규칙을 각자 구현하게 되고, 그게 곧 divergence다.
 */
export async function handleSugoOntology(rawArgs: unknown) {
  const args = SugoOntologyArgs.parse(rawArgs);

  if (args.boundary) {
    const boundary = BOUNDARIES.find((b) => b.name === args.boundary);
    if (!boundary) {
      return json({
        ok: false,
        errorCode: "UNKNOWN_BOUNDARY",
        message: `알 수 없는 boundary: ${args.boundary}`,
        available: BOUNDARIES.map((b) => b.name),
      });
    }
    return json({
      ok: true,
      boundary: {
        name: boundary.name,
        contract: boundary.contract,
        invariants: boundary.invariantIds.map((id) => INVARIANTS.find((i) => i.id === id)),
      },
    });
  }

  if (args.view) {
    return json({ ok: true, view: args.view, [args.view]: ONTOLOGY[args.view] });
  }

  return json({
    ok: true,
    ontology: ONTOLOGY,
    derived: {
      prerequisites: PREREQUISITES,
      resultState: RESULT_STATE,
      allowedActionsByState: ALLOWED_ACTIONS_BY_STATE,
    },
    note: "derived.*는 ontology.actionTypes에서 파생된 값이다(§2.8) — 별도로 손관리되는 사본이 아니다.",
  });
}

function json(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
