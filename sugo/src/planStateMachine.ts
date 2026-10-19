import { ACTION_TYPES, CHAIN_ABANDON_STATES } from "./ontology/model.js";
import {
  createEmptySessionData,
  NEXT_ACTION_HINTS,
  PREREQUISITES,
  RESULT_STATE,
  type PlanAction,
  type PlanSession,
} from "./types.js";

export interface TransitionParams {
  projectPath?: string;
  featureName?: string;
  /** cancel: 체인 구간에서 접을 때의 사유. 그 구간이 아니면 선택. */
  cancelReason?: string;
}

export interface TransitionResult {
  ok: boolean;
  errorCode?:
    | "PREREQUISITE_FAILED"
    | "SESSION_NOT_FOUND"
    | "MISSING_PROJECT_PATH"
    | "ALREADY_CANCELLED"
    | "CANCEL_REASON_REQUIRED";
  message?: string;
  session?: PlanSession;
  nextActionHints?: PlanAction[];
  /** cancel이 에이전트 체인 구간에서 일어났는지 — 호출부가 abandonedChain 라벨을 남길지 판단한다. */
  abandonedChain?: boolean;
}

/**
 * Gate Keeper: action이 이 session의 현재 상태에서 허용되는지 판정.
 * start/status/cancel은 전제상태가 없어(빈 배열) 항상 통과 — 단, cancel은 세션 존재를 요구(호출부에서 처리).
 */
export function checkPrerequisite(action: PlanAction, currentState: PlanSession["state"] | null): TransitionResult {
  // 파생 규칙상 PREREQUISITES는 fromStates!==null인 액션만 담는다 —
  // 키 부재 = "전제 없음"(start/status/cancel)이고, 빈 배열과 같은 뜻이다.
  const allowed = PREREQUISITES[action];
  if (!allowed || allowed.length === 0) {
    return { ok: true };
  }
  if (currentState === null) {
    return {
      ok: false,
      errorCode: "SESSION_NOT_FOUND",
      message: `action "${action}"에는 세션이 필요합니다.`,
    };
  }
  if (!allowed.includes(currentState)) {
    return {
      ok: false,
      errorCode: "PREREQUISITE_FAILED",
      message: `action "${action}"은(는) 상태 [${allowed.join(", ")}]에서만 허용됩니다. 현재 상태: ${currentState}`,
    };
  }
  return { ok: true };
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * 순수 함수: (기존 세션 | null, action, params) -> 다음 세션 상태 + 결과.
 * 파일 IO는 호출부(tools/sugoPlan.ts)의 책임. 이 함수는 상태 판정/전이만 한다.
 */
export function applyTransition(
  session: PlanSession | null,
  action: PlanAction,
  newSessionId: string,
  params: TransitionParams,
): TransitionResult {
  if (action === "start") {
    if (!params.projectPath) {
      return { ok: false, errorCode: "MISSING_PROJECT_PATH", message: "start에는 projectPath가 필요합니다." };
    }
    const created: PlanSession = {
      id: newSessionId,
      state: "SCAN",
      projectPath: params.projectPath,
      featureName: params.featureName ?? "unnamed-feature",
      startedAt: nowIso(),
      updatedAt: nowIso(),
      data: createEmptySessionData(),
    };
    return { ok: true, session: created, nextActionHints: NEXT_ACTION_HINTS.SCAN };
  }

  if (action === "status") {
    const prereq = checkPrerequisite(action, session?.state ?? null);
    if (!prereq.ok) return prereq;
    return {
      ok: true,
      session: session ?? undefined,
      nextActionHints: session ? NEXT_ACTION_HINTS[session.state] : ["start"],
    };
  }

  if (action === "cancel") {
    if (!session) {
      return { ok: false, errorCode: "SESSION_NOT_FOUND", message: "취소할 세션이 없습니다." };
    }
    if (session.cancelledAt) {
      return { ok: false, errorCode: "ALREADY_CANCELLED", message: "이미 취소된 세션입니다." };
    }
    // 체인 구간 취소는 "증거 체인을 끊고 접었다"는 뜻이라 사유를 요구한다. 호출부가
    // abandonedChain 라벨로 남긴다 — 막지 않고 기록한다.
    const abandonsChain = (CHAIN_ABANDON_STATES as readonly string[]).includes(session.state);
    if (abandonsChain && !params.cancelReason?.trim()) {
      return {
        ok: false,
        errorCode: "CANCEL_REASON_REQUIRED",
        message: `${session.state}은 에이전트 체인 구간입니다 — 취소하려면 cancelReason이 필요합니다(왜 완주하지 않고 접는지).`,
      };
    }
    const cancelled: PlanSession = { ...session, cancelledAt: nowIso() };
    return { ok: true, session: cancelled, nextActionHints: [], abandonedChain: abandonsChain };
  }

  // 나머지 액션은 모두 기존 세션 + 전제상태 충족을 요구
  const prereq = checkPrerequisite(action, session?.state ?? null);
  if (!prereq.ok) return prereq;
  // checkPrerequisite가 ok면 session은 non-null (allowed.length가 0인 액션은 위에서 이미 처리됨)
  const current = session as PlanSession;
  const resultState = RESULT_STATE[action];
  if (!resultState) {
    // `toState: null` = **기록성 액션**(현재는 oracle_done). 전제는 검사하되 상태는 그대로
    // 둔다 — 이게 데드락을 막는 핵심이다. oracle_done이 상태를 옮겨버리면 PRD/JIRA 중
    // 한쪽에서만 기록할 수 있게 되고, 다른 쪽에서 온 세션은 ready가 영영 안 열린다.
    // 부수효과(specOracle.ran 기록)는 호출부(tools/sugoPlan.ts)가 세션 데이터에 쓴다.
    //
    // 온톨로지에 없는 액션이 여기 오면 그건 4계층이 갈라졌다는 뜻이라 통과시키면 안 된다
    // (gate-consistency.test.ts가 CI에서 먼저 잡지만, 런타임도 열어두지 않는다).
    const declared = ACTION_TYPES.find((a) => a.name === action);
    if (!declared || declared.toState !== null) {
      return { ok: false, errorCode: "PREREQUISITE_FAILED", message: `알 수 없는 action: ${action}` };
    }
    return { ok: true, session: current, nextActionHints: NEXT_ACTION_HINTS[current.state] };
  }
  const next: PlanSession = { ...current, state: resultState };
  return { ok: true, session: next, nextActionHints: NEXT_ACTION_HINTS[resultState] };
}
