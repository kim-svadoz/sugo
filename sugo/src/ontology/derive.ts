import {
  ACTION_TYPES,
  CANCELLABLE_STATES,
  CHAIN_ABANDON_STATES,
  START_STATES,
  WORKFLOW_STATES,
  type ActionName,
  type WorkflowState,
} from "./model.js";

/**
 * §2.8 파생 관계 — **복붙 divergence 제거의 핵심.**
 *
 * 여기 있는 것들은 전부 `model.ts`의 `ACTION_TYPES` 하나에서 계산된다. 손으로 관리되는 사본이
 * 존재하면 안 된다: 액션을 추가하면서 한 군데를 빠뜨려도 타입은 통과하고, "게이트는 요구하는데
 * 허용목록엔 없어"라는 런타임 데드락으로만 드러나기 때문이다.
 *
 * 모듈 로드 시 1회 계산한다(상수 재료라 순수 함수 + 캐시가 동일).
 */

/**
 * §2.8 "PREREQUISITES = ACTION_TYPES를 fromStates!==null로 필터해 {액션:[진입허용상태]}로 생성".
 * `start`/`status`/`cancel`처럼 전제가 없는 액션은 **키 자체가 없다** — 호출부는 키 부재를
 * "전제 없음"으로 읽어야 한다(빈 배열과 같은 뜻).
 */
export const PREREQUISITES: Partial<Record<ActionName, readonly WorkflowState[]>> = Object.fromEntries(
  ACTION_TYPES.filter((a) => a.fromStates !== null).map((a) => [a.name, a.fromStates as readonly WorkflowState[]]),
) as Partial<Record<ActionName, readonly WorkflowState[]>>;

/** 성공 시 전이할 상태. `toState: null`인 기록성 액션(oracle_done/status/cancel)은 키가 없다. */
export const RESULT_STATE: Partial<Record<ActionName, WorkflowState>> = Object.fromEntries(
  ACTION_TYPES.filter((a) => a.toState !== null).map((a) => [a.name, a.toState as WorkflowState]),
) as Partial<Record<ActionName, WorkflowState>>;

/**
 * §2.8 "ALLOWED_TOOLS_BY_STATE.actions = 각 상태 S의 허용 액션 = fromStates에 S를 포함하는 모든
 * ACTION_TYPES.name + 보편 액션에서 파생".
 *
 * 보편 액션 3종은 `fromStates: null`이라 역인덱싱에 안 잡히므로 여기서 정책으로 얹는다:
 * - `start` — START_STATES(INIT/DONE)에서만
 * - `status` — 언제나(관측은 절대 막지 않는다)
 * - `cancel` — CANCELLABLE_STATES에서만
 *
 * 결과는 §4 "Golden per-state action set" 표와 정확히 일치해야 하며, 그 일치를
 * `gate-consistency.test.ts`가 하드코딩된 골든 테이블로 잠근다(파생이 옳다는 것의 독립 증명).
 */
function deriveAllowedActions(state: WorkflowState): ActionName[] {
  const fromOntology = ACTION_TYPES.filter((a) => a.fromStates !== null && (a.fromStates as readonly string[]).includes(state)).map(
    (a) => a.name as ActionName,
  );
  const universal: ActionName[] = [];
  if ((START_STATES as readonly string[]).includes(state)) universal.push("start");
  universal.push("status");
  // 체인 구간도 취소는 된다(사유 필수) — 런타임이 실제로 허용하므로 허용목록이 사실을 반영해야 한다.
  if (
    (CANCELLABLE_STATES as readonly string[]).includes(state) ||
    (CHAIN_ABANDON_STATES as readonly string[]).includes(state)
  ) {
    universal.push("cancel");
  }
  return [...fromOntology, ...universal];
}

export const ALLOWED_ACTIONS_BY_STATE = Object.fromEntries(
  WORKFLOW_STATES.map((s) => [s, deriveAllowedActions(s)]),
) as unknown as Record<WorkflowState, readonly ActionName[]>;

/** 게이트키퍼 질의용 얇은 헬퍼. 상태가 없으면(세션 미존재) INIT로 취급한다. */
export function isActionAllowedInState(action: ActionName, state: WorkflowState | null): boolean {
  return ALLOWED_ACTIONS_BY_STATE[state ?? "INIT"].includes(action);
}
