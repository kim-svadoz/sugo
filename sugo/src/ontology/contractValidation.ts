import type { PlanSession } from "../types.js";
import { ALLOWED_ACTIONS_BY_STATE } from "./derive.js";
import { ACTION_TYPES } from "./model.js";
import { explainSessionBlock, explainSessionState, projectNextActions } from "./operationalQueries.js";
import { projectSessionOntology } from "./runtimeProjection.js";
import { assessSession } from "./sessionAssessment.js";

export type OperationalContractViolationCode =
  | "ASSESSMENT_PROJECTION_DRIFT"
  | "STATE_EXPLANATION_DRIFT"
  | "BLOCK_EXPLANATION_DRIFT"
  | "NEXT_ACTION_UNDECLARED"
  | "NEXT_ACTION_NOT_ALLOWED"
  | "TRANSITION_ACTION_UNDECLARED"
  | "TRANSITION_SOURCE_MISMATCH"
  | "TRANSITION_TARGET_MISMATCH"
  | "TRANSITION_DECLARATION_MISMATCH";

export interface OperationalContractViolation {
  code: OperationalContractViolationCode;
  message: string;
}

/**
 * 저장 세션을 네 독립 소비 표면(assessment/runtime projection/운영 query/전이 선언)에 대조한다.
 * 게이트를 대신 통과시키지 않으며 값을 보정하지도 않는다. 모순을 구조화해 테스트와 진단에서 쓴다.
 */
export function validateOperationalContract(session: PlanSession) {
  const violations: OperationalContractViolation[] = [];
  const assessment = assessSession(session);
  const projection = projectSessionOntology(session);
  const state = explainSessionState(session);
  const block = explainSessionBlock(session);
  const next = projectNextActions(session);

  if (JSON.stringify(projection.assessment) !== JSON.stringify(assessment)) {
    violations.push({ code: "ASSESSMENT_PROJECTION_DRIFT", message: "runtime projection의 assessment가 정본 assessment와 다릅니다." });
  }
  if (state.currentState !== assessment.currentStage || state.status !== assessment.status) {
    violations.push({ code: "STATE_EXPLANATION_DRIFT", message: "explain_state의 상태가 assessment와 다릅니다." });
  }
  if (block.blocked !== (assessment.status === "blocked" || assessment.blockers.length > 0)) {
    violations.push({ code: "BLOCK_EXPLANATION_DRIFT", message: "explain_block의 차단 판정이 assessment와 다릅니다." });
  }

  const declaredActions = new Map(ACTION_TYPES.map((action) => [action.name, action]));
  const allowed = new Set(ALLOWED_ACTIONS_BY_STATE[session.state]);
  for (const projected of next.actions) {
    if (!declaredActions.has(projected.action)) {
      violations.push({ code: "NEXT_ACTION_UNDECLARED", message: `선언되지 않은 다음 action입니다: ${projected.action}` });
    } else if (!allowed.has(projected.action)) {
      violations.push({ code: "NEXT_ACTION_NOT_ALLOWED", message: `${session.state}에서 허용되지 않은 다음 action입니다: ${projected.action}` });
    }
  }

  const transition = session.data.lastTransition;
  if (transition) {
    const declaration = declaredActions.get(transition.action);
    if (!declaration) {
      violations.push({ code: "TRANSITION_ACTION_UNDECLARED", message: `선언되지 않은 기록 action입니다: ${transition.action}` });
    } else {
      if (declaration.fromStates && !(declaration.fromStates as readonly string[]).includes(transition.fromState)) {
        violations.push({ code: "TRANSITION_SOURCE_MISMATCH", message: `${transition.action}은 ${transition.fromState}에서 시작할 수 없습니다.` });
      }
      if (declaration.toState !== transition.toState) {
        violations.push({ code: "TRANSITION_DECLARATION_MISMATCH", message: `${transition.action}의 선언 target ${declaration.toState ?? "none"}과 기록 ${transition.toState}가 다릅니다.` });
      }
    }
    if (transition.toState !== session.state) {
      violations.push({ code: "TRANSITION_TARGET_MISMATCH", message: `마지막 전이 target ${transition.toState}와 현재 상태 ${session.state}가 다릅니다.` });
    }
  }

  return { valid: violations.length === 0, violations };
}
