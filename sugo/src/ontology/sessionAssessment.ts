import { currentBlockers, remainingSteps } from "../completionPlan.js";
import type { HumanBlocker } from "../work/types.js";
import type { PlanSession } from "../types.js";
import { ALLOWED_ACTIONS_BY_STATE } from "./derive.js";
import type { ActionName, WorkflowState } from "./model.js";

export type SessionAssessmentStatus = "in_progress" | "blocked" | "completed" | "cancelled";
export type StoredEvidenceStatus = "present" | "missing";

export interface StoredEvidenceAssessment {
  id: "baseline" | "contract-red-green" | "analyze" | "test" | "validation" | "lethal-trifecta" | "runtime" | "work-result";
  label: string;
  status: StoredEvidenceStatus;
  source: string;
}

export interface HumanDecisionAssessment {
  question: string;
  context: string[];
  options: HumanBlocker["options"];
}

export interface SessionAssessment {
  projectionSchemaVersion: 1;
  status: SessionAssessmentStatus;
  currentStage: WorkflowState;
  nextActions: ActionName[];
  recommendedAction: ActionName | null;
  humanDecisionRequired: boolean;
  blockers: string[];
  evidence: StoredEvidenceAssessment[];
  blockingReason?: string;
  blockedNextStep?: string;
  resumesAt?: string;
  decision?: HumanDecisionAssessment;
}

const OBSERVATION_ACTIONS = new Set<ActionName>(["status", "cancel", "start"]);

function evidenceFor(session: PlanSession, action: ActionName | null): StoredEvidenceAssessment[] {
  if (!action) return [];
  const chain = session.data.chainInfo;
  const baseline = (): StoredEvidenceAssessment => ({
    id: "baseline",
    label: "Baseline 실행 증거",
    status: session.data.baselineGate?.evidence ? "present" : "missing",
    source: "session.data.baselineGate.evidence",
  });
  const contract = (): StoredEvidenceAssessment => ({
    id: "contract-red-green",
    label: "계약 테스트 red→green 증거",
    status: (chain.contractTests ?? []).some((record) => record.redExitCode !== undefined && record.greenExitCode !== undefined)
      ? "present"
      : "missing",
    source: "session.data.chainInfo.contractTests",
  });

  switch (action) {
    case "baseline_capture":
      return [baseline()];
    case "contract_done":
      return [contract()];
    case "code_done":
      return [
        ...(session.data.baselineGate?.required ? [baseline()] : []),
        {
          id: "analyze",
          label: "PRD 키워드 진단 실행 기록",
          status: chain.analyzeAttempts > 0 ? "present" : "missing",
          source: "session.data.chainInfo.analyzeAttempts",
        },
      ];
    case "test_done":
      return [{
        id: "test",
        label: "테스트 실행 증거",
        status: chain.testEvidence ? "present" : "missing",
        source: "session.data.chainInfo.testEvidence",
      }];
    case "review_done":
      return [
        { id: "test", label: "테스트 실행 증거", status: chain.testEvidence ? "present" : "missing", source: "session.data.chainInfo.testEvidence" },
        { id: "validation", label: "검증 결과", status: chain.lastValidation ? "present" : "missing", source: "session.data.chainInfo.lastValidation" },
        { id: "lethal-trifecta", label: "Lethal Trifecta 점검", status: chain.lastLethalTrifectaCheck ? "present" : "missing", source: "session.data.chainInfo.lastLethalTrifectaCheck" },
        {
          id: "runtime",
          label: "런타임·배선 검증 기록",
          status: chain.runtimeVerified !== undefined || chain.wiringVerified !== undefined ? "present" : "missing",
          source: "session.data.chainInfo.runtimeVerified + wiringVerified",
        },
        ...(chain.contractTests?.length ? [contract()] : []),
      ];
    case "commit":
      return [{
        id: "work-result",
        label: "Work Result",
        status: chain.workResultPath || chain.workResultReport ? "present" : "missing",
        source: "session.data.chainInfo.workResultPath + workResultReport",
      }];
    default:
      return [];
  }
}

/**
 * 저장된 세션만으로 사람이 지금 알아야 할 운영 상태를 계산한다.
 * 이 값은 게이트 통과를 예언하지 않는다. 현재 저장된 증거의 존재 여부와 선언된 전이만 설명한다.
 */
export function assessSession(session: PlanSession): SessionAssessment {
  const decision = session.data.humanDecisionGate?.blocker;
  const status: SessionAssessmentStatus = session.cancelledAt
    ? "cancelled"
    : session.state === "DONE"
      ? "completed"
      : decision
        ? "blocked"
        : "in_progress";
  const terminalOrBlocked = status !== "in_progress";
  const nextActions = terminalOrBlocked
    ? []
    : ALLOWED_ACTIONS_BY_STATE[session.state].filter((action) => !OBSERVATION_ACTIONS.has(action));
  const recommendedAction = terminalOrBlocked ? null : (remainingSteps(session.state)[0]?.action ?? nextActions[0] ?? null);
  const measuredBlockers = currentBlockers(session.data.chainInfo);
  const blockers = status === "completed" || status === "cancelled"
    ? []
    : decision
      ? [decision.summary, ...measuredBlockers]
      : measuredBlockers;

  return {
    projectionSchemaVersion: 1,
    status,
    currentStage: session.state,
    nextActions,
    recommendedAction,
    humanDecisionRequired: Boolean(decision),
    blockers,
    evidence: evidenceFor(session, recommendedAction),
    ...(decision
      ? {
          blockingReason: decision.summary,
          blockedNextStep: decision.blockedNextStep,
          resumesAt: decision.resumeAction,
          decision: { question: decision.question, context: decision.context, options: decision.options },
        }
      : {}),
  };
}
