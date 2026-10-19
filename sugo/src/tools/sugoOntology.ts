import { z } from "zod";
import { BOUNDARIES, INVARIANTS, ONTOLOGY, type OntologyView } from "../ontology/model.js";
import { ALLOWED_ACTIONS_BY_STATE, PREREQUISITES, RESULT_STATE } from "../ontology/derive.js";
import { ONTOLOGY_MODEL_IDENTITY } from "../ontology/identity.js";
import { projectSessionOntology } from "../ontology/runtimeProjection.js";
import { loadAllSessions, loadSession, sessionExists } from "../session.js";
import { getTask, listTasks } from "../work/task.js";
import { WORKFLOW_GRAPH_ANALYSIS } from "../ontology/workflowGraph.js";
import { explainSessionBlock, explainSessionState, projectNextActions, traceTaskArtifacts } from "../ontology/operationalQueries.js";
import { listRoadmapNodes } from "../work/roadmap.js";
import { listWorkspaces } from "../work/workspace.js";
import type { PlanSession } from "../types.js";
import { EXPLANATION_PROFILES, explanationProfileContract } from "../ontology/explanationProfile.js";

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
  "intentionalWorkflowCycles",
  "evidenceFlows",
] as const satisfies readonly OntologyView[];

export const sugoOntologyInputSchema = {
  query: z.enum(["explain_state", "explain_block", "next_actions", "trace_artifact"]).optional()
    .describe("운영 질의. explain_state/next_actions는 sessionId, explain_block은 sessionId 또는 taskId, trace_artifact는 taskId가 필요하다"),
  view: z
    .enum(VIEWS)
    .optional()
    .describe("조회할 섹션. 생략하면 전체 모델 + 파생 테이블을 반환한다"),
  boundary: z
    .string()
    .optional()
    .describe("결함 표면 이름(handoff|sync|lifecycle|workflow). 해당 경계와 거기 걸린 불변식을 함께 반환한다"),
  sessionId: z
    .string()
    .min(1)
    .optional()
    .describe("저장된 feat/patch 세션을 실행 객체·관계 projection으로 조회한다"),
  taskId: z.string().min(1).optional().describe("explain_block/trace_artifact가 조회할 roadmap Task ID"),
  presentation: z.enum(EXPLANATION_PROFILES).optional()
    .describe("운영 질의의 사실 result는 유지하고 설명 표현 계약을 추가한다. ste-inspired-ko는 STE 원칙 기반 한국어이며 정식 준수 표기가 아니다. asd-ste100-en은 전문 검토 전 준수 미검증이다"),
};

const SugoOntologyArgs = z.object(sugoOntologyInputSchema);

/**
 * `sugo_ontology(view, boundary)` — 온톨로지 런타임 조회(readOnly).
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
  if (args.query) return handleOperationalQuery(args);
  if (args.presentation) {
    return ontologyError("PRESENTATION_REQUIRES_QUERY", "presentation은 운영 query와 함께 지정해야 합니다.");
  }
  if (args.taskId) {
    return ontologyError("TASK_ID_REQUIRES_QUERY", "taskId는 explain_block 또는 trace_artifact query와 함께 지정해야 합니다.");
  }
  const selectorCount = [args.view, args.boundary, args.sessionId].filter(Boolean).length;
  if (selectorCount > 1) {
    return json({
      ok: false,
      model: ONTOLOGY_MODEL_IDENTITY,
      errorCode: "AMBIGUOUS_ONTOLOGY_QUERY",
      message: "view, boundary, sessionId 중 하나만 지정해야 합니다.",
    });
  }

  if (args.sessionId) {
    if (!(await sessionExists(args.sessionId))) {
      return json({
        ok: false,
        model: ONTOLOGY_MODEL_IDENTITY,
        errorCode: "SESSION_NOT_FOUND",
        message: `세션을 찾을 수 없습니다: ${args.sessionId}`,
      });
    }
    const session = await loadSession(args.sessionId);
    const task = session.data.linkedWorkspace && session.data.linkedTaskId
      ? await getTask(session.data.linkedWorkspace, session.data.linkedTaskId)
      : null;
    return json({ ok: true, model: ONTOLOGY_MODEL_IDENTITY, projection: projectSessionOntology(session, task) });
  }

  if (args.boundary) {
    const boundary = BOUNDARIES.find((b) => b.name === args.boundary);
    if (!boundary) {
      return json({
        ok: false,
        model: ONTOLOGY_MODEL_IDENTITY,
        errorCode: "UNKNOWN_BOUNDARY",
        message: `알 수 없는 boundary: ${args.boundary}`,
        available: BOUNDARIES.map((b) => b.name),
      });
    }
    return json({
      ok: true,
      model: ONTOLOGY_MODEL_IDENTITY,
      boundary: {
        name: boundary.name,
        contract: boundary.contract,
        invariants: boundary.invariantIds.map((id) => INVARIANTS.find((i) => i.id === id)),
        ...(boundary.name === "workflow" ? { graphAnalysis: WORKFLOW_GRAPH_ANALYSIS } : {}),
      },
    });
  }

  if (args.view) {
    return json({ ok: true, model: ONTOLOGY_MODEL_IDENTITY, view: args.view, [args.view]: ONTOLOGY[args.view] });
  }

  return json({
    ok: true,
    model: ONTOLOGY_MODEL_IDENTITY,
    ontology: ONTOLOGY,
    derived: {
      prerequisites: PREREQUISITES,
      resultState: RESULT_STATE,
      allowedActionsByState: ALLOWED_ACTIONS_BY_STATE,
      workflowGraph: WORKFLOW_GRAPH_ANALYSIS,
    },
    note: "derived.*는 ontology.actionTypes에서 파생된 값이다 — 별도로 손관리되는 사본이 아니다.",
  });
}

async function handleOperationalQuery(args: z.infer<typeof SugoOntologyArgs>) {
  if (args.view || args.boundary) {
    return ontologyError("AMBIGUOUS_ONTOLOGY_QUERY", "query는 view 또는 boundary와 함께 지정할 수 없습니다.");
  }
  if ((args.query === "explain_state" || args.query === "next_actions") && !args.sessionId) {
    return ontologyError("SESSION_ID_REQUIRED", `${args.query}에는 sessionId가 필요합니다.`);
  }
  if ((args.query === "explain_state" || args.query === "next_actions") && args.taskId) {
    return ontologyError("AMBIGUOUS_ONTOLOGY_QUERY", `${args.query}는 sessionId만 지정해야 합니다.`);
  }
  if (args.query === "explain_block" && Boolean(args.sessionId) === Boolean(args.taskId)) {
    return ontologyError("SESSION_OR_TASK_ID_REQUIRED", "explain_block에는 sessionId 또는 taskId 중 하나만 필요합니다.");
  }
  if (args.query === "trace_artifact" && !args.taskId) {
    return ontologyError("TASK_ID_REQUIRED", "trace_artifact에는 taskId가 필요합니다.");
  }
  if (args.query === "trace_artifact" && args.sessionId) {
    return ontologyError("AMBIGUOUS_ONTOLOGY_QUERY", "trace_artifact는 taskId만 지정해야 합니다.");
  }

  if (args.query === "trace_artifact") {
    const resolved = await resolveTask(args.taskId!);
    if (resolved.error) return ontologyError(resolved.error, resolved.message!);
    const result = traceTaskArtifacts(resolved.session, resolved.task!, await listRoadmapNodes(resolved.workspace!), resolved.workspace);
    return operationalResult(args, result);
  }

  const session = args.sessionId
    ? await readSession(args.sessionId)
    : await latestSessionForTask(args.taskId!);
  if (!session) {
    return ontologyError(args.sessionId ? "SESSION_NOT_FOUND" : "SESSION_FOR_TASK_NOT_FOUND", args.sessionId
      ? `세션을 찾을 수 없습니다: ${args.sessionId}`
      : `Task에 연결된 세션을 찾을 수 없습니다: ${args.taskId}`);
  }
  const result = args.query === "explain_state"
    ? explainSessionState(session)
    : args.query === "explain_block"
      ? explainSessionBlock(session)
      : projectNextActions(session);
  return operationalResult(args, result);
}

function operationalResult(args: z.infer<typeof SugoOntologyArgs>, result: unknown) {
  return json({
    ok: true,
    model: ONTOLOGY_MODEL_IDENTITY,
    query: args.query,
    result,
    ...(args.presentation ? { presentation: explanationProfileContract(args.presentation) } : {}),
  });
}

async function readSession(id: string) {
  return (await sessionExists(id)) ? loadSession(id) : null;
}

async function latestSessionForTask(taskId: string) {
  return (await loadAllSessions())
    .filter((session) => session.data.linkedTaskId === taskId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))[0] ?? null;
}

async function resolveTask(taskId: string): Promise<{
  session: PlanSession | null;
  task?: Awaited<ReturnType<typeof getTask>>;
  workspace?: string;
  error?: string;
  message?: string;
}> {
  const session = await latestSessionForTask(taskId);
  if (session?.data.linkedWorkspace) {
    const task = await getTask(session.data.linkedWorkspace, taskId);
    if (task) return { session, task, workspace: session.data.linkedWorkspace };
  }
  const matches: { workspace: string; task: NonNullable<Awaited<ReturnType<typeof getTask>>> }[] = [];
  for (const workspace of await listWorkspaces(true)) {
    const task = (await listTasks(workspace.name)).find((candidate) => candidate.id === taskId);
    if (task) matches.push({ workspace: workspace.name, task });
  }
  if (matches.length === 0) return { session, error: "TASK_NOT_FOUND", message: `Task를 찾을 수 없습니다: ${taskId}` };
  if (matches.length > 1) return { session, error: "TASK_ID_AMBIGUOUS", message: `여러 워크스페이스에 같은 Task ID가 있습니다: ${taskId}` };
  const matched = matches[0];
  return { session: session?.data.linkedWorkspace === matched.workspace ? session : null, ...matched };
}

function ontologyError(errorCode: string, message: string) {
  return json({ ok: false, model: ONTOLOGY_MODEL_IDENTITY, errorCode, message });
}

function json(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
