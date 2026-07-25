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
}

export interface TransitionResult {
  ok: boolean;
  errorCode?: "PREREQUISITE_FAILED" | "SESSION_NOT_FOUND" | "MISSING_PROJECT_PATH" | "ALREADY_CANCELLED";
  message?: string;
  session?: PlanSession;
  nextActionHints?: PlanAction[];
}

/**
 * Gate Keeper: action이 이 session의 현재 상태에서 허용되는지 판정.
 * start/status/cancel은 전제상태가 없어(빈 배열) 항상 통과 — 단, cancel은 세션 존재를 요구(호출부에서 처리).
 */
export function checkPrerequisite(action: PlanAction, currentState: PlanSession["state"] | null): TransitionResult {
  const allowed = PREREQUISITES[action];
  if (allowed.length === 0) {
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
    const cancelled: PlanSession = { ...session, cancelledAt: nowIso() };
    return { ok: true, session: cancelled, nextActionHints: [] };
  }

  // 나머지 액션은 모두 기존 세션 + 전제상태 충족을 요구
  const prereq = checkPrerequisite(action, session?.state ?? null);
  if (!prereq.ok) return prereq;
  // checkPrerequisite가 ok면 session은 non-null (allowed.length가 0인 액션은 위에서 이미 처리됨)
  const current = session as PlanSession;
  const resultState = RESULT_STATE[action];
  if (!resultState) {
    return { ok: false, errorCode: "PREREQUISITE_FAILED", message: `알 수 없는 action: ${action}` };
  }
  const next: PlanSession = { ...current, state: resultState };
  return { ok: true, session: next, nextActionHints: NEXT_ACTION_HINTS[resultState] };
}
