import type { RoadmapNode, Task } from "../work/types.js";
import type { PlanSession } from "../types.js";
import { ACTION_TYPES, type ActionName } from "./model.js";
import { ALLOWED_ACTIONS_BY_STATE } from "./derive.js";
import { projectSessionOntology } from "./runtimeProjection.js";
import { assessSession } from "./sessionAssessment.js";

export interface StateEntryExplanation {
  recorded: boolean;
  action?: ActionName;
  fromState?: string;
  toState?: string;
  recordedAt?: string;
  inferredCandidates?: ActionName[];
}

/** 현재 상태와 그 진입 근거를 서버 기록만으로 설명한다. 전이 기록이 없는 세션은 후보임을 명시한다. */
export function explainSessionState(session: PlanSession) {
  const assessment = assessSession(session);
  const transition = session.data.lastTransition;
  const enteredBy: StateEntryExplanation = transition?.toState === session.state
    ? { recorded: true, ...transition }
    : {
        recorded: false,
        inferredCandidates: ACTION_TYPES
          .filter((action) => action.toState === session.state)
          .map((action) => action.name as ActionName),
      };
  return {
    querySchemaVersion: 1 as const,
    sessionId: session.id,
    status: assessment.status,
    currentState: session.state,
    enteredBy,
    evidence: assessment.evidence,
    blockers: assessment.blockers,
    updatedAt: session.updatedAt,
  };
}

/** 사람 결정과 저장 증거 차단을 같은 구조로 보여주되, 차단이 없으면 없다고 명시한다. */
export function explainSessionBlock(session: PlanSession) {
  const assessment = assessSession(session);
  const missingEvidence = assessment.evidence.filter((item) => item.status === "missing");
  return {
    querySchemaVersion: 1 as const,
    sessionId: session.id,
    blocked: assessment.status === "blocked" || assessment.blockers.length > 0,
    reason: assessment.blockingReason ?? assessment.blockers[0] ?? null,
    blockers: assessment.blockers,
    missingEvidence,
    requiredHumanDecision: assessment.decision ?? null,
    unresolvedImpact: assessment.blockedNextStep ?? null,
    resumesAt: assessment.resumesAt ?? null,
  };
}

/** 허용 action과 전제·효과·하드 게이트를 ontology 선언에서 직접 투영한다. */
export function projectNextActions(session: PlanSession) {
  const assessment = assessSession(session);
  const terminal = assessment.status === "completed" || assessment.status === "cancelled";
  const allowed = terminal
    ? []
    : ALLOWED_ACTIONS_BY_STATE[session.state].filter((name) => name !== "status" && name !== "start");
  const executable = assessment.status === "blocked" ? allowed.filter((name) => name === "cancel") : allowed;
  return {
    querySchemaVersion: 1 as const,
    sessionId: session.id,
    currentState: session.state,
    blocked: assessment.status === "blocked",
    resumeAction: assessment.resumesAt ?? null,
    actions: executable.map((name) => {
      const action = ACTION_TYPES.find((candidate) => candidate.name === name);
      if (!action) throw new Error(`Undeclared next action: ${name}`);
      return {
        action: name,
        isRecommended: name === assessment.recommendedAction,
        prerequisites: action.fromStates ?? [],
        effect: {
          targetState: action.toState,
          keepsCurrentState: action.toState === null || action.toState === session.state,
          sessionOutcome: name === "cancel" ? "cancelled" : "continues",
        },
        gates: action.gates,
      };
    }),
  };
}

/** 로드맵 계층과 실재하는 세션 evidence/artifact를 한 계보로 조합한다. */
export function traceTaskArtifacts(session: PlanSession | null, task: Task, nodes: RoadmapNode[], workspace?: string) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const taskNode = byId.get(task.id);
  const hierarchy: RoadmapNode[] = [];
  const seen = new Set<string>();
  let cursor = taskNode;
  while (cursor && !seen.has(cursor.id)) {
    hierarchy.unshift(cursor);
    seen.add(cursor.id);
    cursor = cursor.parent ? byId.get(cursor.parent) : undefined;
  }

  const projection = session ? projectSessionOntology(session, task) : null;
  const artifacts = projection?.objects.filter((object) => object.type === "artifact") ?? [];
  const hierarchyComplete = hierarchy.map((node) => node.level).join(">") === "spec>workstream>task";
  return {
    querySchemaVersion: 1 as const,
    taskId: task.id,
    workspace: workspace ?? session?.data.linkedWorkspace ?? null,
    sessionId: session?.id ?? null,
    hierarchy: hierarchy.map(({ id, level, title, status, parent, specPath }) => ({ id, level, title, status, parent: parent ?? null, specPath: specPath ?? null })),
    artifacts,
    evidence: projection?.objects.filter((object) => object.type === "evidence") ?? [],
    productionLinks: projection?.links.filter((link) => link.type === "produces") ?? [],
    roadmapWorkResult: taskNode?.workResult ?? null,
    lineage: taskNode?.lineage ?? [],
    diagnostics: [
      ...(!taskNode ? [{ code: "ROADMAP_TASK_NOT_FOUND", message: `roadmap에서 Task를 찾지 못했습니다: ${task.id}` }] : []),
      ...(taskNode && !hierarchyComplete ? [{ code: "ROADMAP_HIERARCHY_INCOMPLETE", message: "Spec→Run→Task 계층이 완전하지 않습니다." }] : []),
      ...(!session ? [{ code: "SESSION_FOR_TASK_NOT_FOUND", message: `Task에 연결된 세션을 찾지 못했습니다: ${task.id}` }] : []),
      ...(projection?.diagnostics ?? []),
    ],
  };
}
