import { ACTION_TYPES, LINK_TYPES } from "./model.js";
import type { Task } from "../work/types.js";
import type { PlanSession } from "../types.js";
import { assessSession, type SessionAssessment } from "./sessionAssessment.js";

export type RuntimeObjectType = "session" | "task" | "evidence" | "human_decision" | "artifact" | "action";

export interface RuntimeObjectInstance {
  id: string;
  type: RuntimeObjectType;
  label: string;
  attributes: Record<string, unknown>;
}

export interface RuntimeLinkInstance {
  type: string;
  from: string;
  to: string;
  attributes?: Record<string, unknown>;
}

export interface ProjectionDiagnostic {
  code: "TASK_LINK_UNAVAILABLE" | "TASK_RECORD_NOT_FOUND" | "UNKNOWN_RESUME_ACTION";
  message: string;
}

export interface SessionOntologyProjection {
  sessionId: string;
  assessment: SessionAssessment;
  objects: RuntimeObjectInstance[];
  links: RuntimeLinkInstance[];
  diagnostics: ProjectionDiagnostic[];
}

const DECLARED_LINKS = new Set<string>(LINK_TYPES.map((link) => link.name));
const DECLARED_ACTIONS = new Set<string>(ACTION_TYPES.map((action) => action.name));

/**
 * 저장된 세션을 P1 객체·관계 인스턴스로 바꾸는 순수 projection.
 * 존재하지 않는 증거/Task를 placeholder로 꾸며내지 않는다. 해석할 수 없는 연결은 diagnostics에 남긴다.
 */
export function projectSessionOntology(session: PlanSession, task?: Task | null): SessionOntologyProjection {
  const objects = new Map<string, RuntimeObjectInstance>();
  const links: RuntimeLinkInstance[] = [];
  const diagnostics: ProjectionDiagnostic[] = [];
  const sessionId = `session:${session.id}`;

  const putObject = (object: RuntimeObjectInstance) => objects.set(object.id, object);
  const putAction = (action: string) => {
    const id = `action:${action}`;
    putObject({ id, type: "action", label: action, attributes: { action } });
    return id;
  };
  const putLink = (link: RuntimeLinkInstance) => {
    if (!DECLARED_LINKS.has(link.type)) throw new Error(`Undeclared ontology link: ${link.type}`);
    links.push(link);
  };

  putObject({
    id: sessionId,
    type: "session",
    label: session.featureName,
    attributes: {
      state: session.state,
      mode: session.data.mode,
      projectPath: session.projectPath,
      startedAt: session.startedAt,
      updatedAt: session.updatedAt,
      cancelledAt: session.cancelledAt,
    },
  });

  if (!session.data.linkedTaskId) {
    diagnostics.push({ code: "TASK_LINK_UNAVAILABLE", message: "세션에 연결된 Task ID가 없습니다." });
  } else if (!task || task.id !== session.data.linkedTaskId) {
    diagnostics.push({ code: "TASK_RECORD_NOT_FOUND", message: `연결된 Task를 로드하지 못했습니다: ${session.data.linkedTaskId}` });
  } else {
    const taskId = `task:${task.id}`;
    putObject({ id: taskId, type: "task", label: task.title, attributes: { status: task.status, project: task.project } });
    putLink({ type: "operates_on", from: sessionId, to: taskId });
    if (task.patchInfo) {
      const parentId = `task:${task.patchInfo.parentTaskId}`;
      if (!objects.has(parentId)) {
        putObject({ id: parentId, type: "task", label: task.patchInfo.parentTaskId, attributes: { referenceOnly: true } });
      }
      putLink({
        type: "derived_from",
        from: taskId,
        to: parentId,
        attributes: { patchVersion: task.patchInfo.patchVersion },
      });
    }
  }

  const putEvidence = (suffix: string, label: string, evidence: Record<string, unknown>, requiredBy: string, producedBy?: string) => {
    const evidenceId = `evidence:${session.id}:${suffix}`;
    putObject({ id: evidenceId, type: "evidence", label, attributes: evidence });
    putLink({ type: "requires", from: putAction(requiredBy), to: evidenceId });
    if (producedBy) putLink({ type: "produces", from: putAction(producedBy), to: evidenceId });
  };

  const baseline = session.data.baselineGate?.evidence;
  if (baseline) putEvidence("baseline", "Baseline evidence", { ...baseline }, "baseline_capture", "baseline_capture");

  const testEvidence = session.data.chainInfo.testEvidence;
  if (testEvidence) {
    putEvidence("test", "Test evidence", { ...testEvidence }, "test_done");
    putLink({ type: "requires", from: putAction("review_done"), to: `evidence:${session.id}:test` });
  }

  for (const [index, contract] of (session.data.chainInfo.contractTests ?? []).entries()) {
    const suffix = `contract:${encodeURIComponent(contract.contractId)}:${index}`;
    putEvidence(suffix, `Contract evidence: ${contract.contractId}`, { ...contract }, "contract_done");
    putLink({ type: "requires", from: putAction("review_done"), to: `evidence:${session.id}:${suffix}` });
  }

  const validation = session.data.chainInfo.lastValidation;
  if (validation) putEvidence("validation", "Validation evidence", { ...validation }, "review_done");

  const lethal = session.data.chainInfo.lastLethalTrifectaCheck;
  if (lethal) putEvidence("lethal-trifecta", "Lethal Trifecta evidence", { ...lethal }, "review_done");

  if (session.data.chainInfo.runtimeVerified !== undefined || session.data.chainInfo.wiringVerified !== undefined) {
    putEvidence(
      "runtime",
      "Runtime evidence",
      { runtimeVerified: session.data.chainInfo.runtimeVerified, wiringVerified: session.data.chainInfo.wiringVerified },
      "review_done",
    );
  }

  const putArtifact = (suffix: string, label: string, attributes: Record<string, unknown>, producedBy: string) => {
    const artifactId = `artifact:${session.id}:${suffix}`;
    putObject({ id: artifactId, type: "artifact", label, attributes });
    putLink({ type: "produces", from: putAction(producedBy), to: artifactId });
  };
  if (session.data.prdPath) putArtifact("prd", "PRD", { path: session.data.prdPath }, "prd");
  if (session.data.chainInfo.workResultPath || session.data.chainInfo.workResultReport) {
    putArtifact(
      "work-result",
      "Work Result",
      { path: session.data.chainInfo.workResultPath, report: session.data.chainInfo.workResultReport },
      "review_done",
    );
  }

  const decision = session.data.humanDecisionGate;
  if (decision) {
    const decisionId = `human-decision:${session.id}`;
    putObject({
      id: decisionId,
      type: "human_decision",
      label: decision.blocker.summary,
      attributes: { workspace: decision.workspace, taskId: decision.taskId, ...decision.blocker },
    });
    putLink({ type: "blocks", from: decisionId, to: sessionId });
    if (DECLARED_ACTIONS.has(decision.blocker.resumeAction)) {
      putLink({ type: "resumes_at", from: decisionId, to: putAction(decision.blocker.resumeAction) });
    } else {
      diagnostics.push({
        code: "UNKNOWN_RESUME_ACTION",
        message: `선언되지 않은 복귀 action입니다: ${decision.blocker.resumeAction}`,
      });
    }
  }

  return { sessionId: session.id, assessment: assessSession(session), objects: [...objects.values()], links, diagnostics };
}
