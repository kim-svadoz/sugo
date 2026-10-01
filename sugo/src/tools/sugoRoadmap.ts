import { z } from "zod";
import {
  addRoadmapNode,
  backfillRoadmapTask,
  getReadySet,
  getRoadmapNode,
  groupRoadmapNodes,
  linkRoadmapNodes,
  listRoadmapNodes,
  markRequirementDone,
  pullRoadmapOrdering,
  removeRoadmapNode,
  unlinkRoadmapNodes,
  updateRoadmapNodeStatus,
  blockRoadmapNodeForHuman,
  resumeRoadmapNodeWithDecision,
  updateRoadmapNodeRuntimeAssessment,
} from "../hulk/roadmap.js";
import { ROADMAP_LEVELS, ROADMAP_NODE_STATUSES } from "../hulk/types.js";
import { fetchBlockerDecision } from "../dashboard/fetch.js";
import { loadSession, saveSession, sessionExists } from "../session.js";
import { assessSession } from "../ontology/sessionAssessment.js";

export const sugoRoadmapInputSchema = {
  action: z.enum([
    "add",
    "remove",
    "status",
    "link",
    "unlink",
    "group",
    "backfill",
    "list",
    "ready",
    "get",
    "mark_req",
    "pull_ordering",
    "block_for_human",
    "resume_with_decision",
  ]),
  workspace: z.string().describe("HULK 워크스페이스 이름"),
  id: z.string().optional().describe("add/remove/status/get/mark_req action에 필요. add의 새 노드 id 또는 대상 노드 id"),
  title: z.string().optional().describe("add/group/backfill action에 필요"),
  level: z.enum(ROADMAP_LEVELS).optional().describe("add action에 필요"),
  dependsOn: z.array(z.string()).optional().describe("add action에서 초기 의존관계(빈 배열 기본)"),
  parent: z.string().optional(),
  ref: z.string().optional(),
  specPath: z.string().optional(),
  note: z.string().optional(),
  status: z.enum(ROADMAP_NODE_STATUSES).optional().describe("status/mark_req action에 필요(mark_req는 항상 done)"),
  resultSummary: z.string().optional().describe("status/mark_req action에서 result.summary로 기록"),
  logId: z.string().optional().describe("status/mark_req action에서 result.logId로 기록"),
  fromId: z.string().optional().describe("link/unlink action에 필요"),
  toId: z.string().optional().describe("link/unlink action에 필요 — fromId가 toId에 의존하게 된다"),
  taskIds: z.array(z.string()).optional().describe("group action에 필요 — 이 workstream 아래로 묶을 task id들"),
  filterLevel: z.enum(ROADMAP_LEVELS).optional().describe("list action의 선택적 필터"),
  filterParent: z.string().optional().describe("list action의 선택적 필터"),
  sessionId: z.string().optional().describe("block_for_human/resume_with_decision: 원래 sugo_plan 세션 ID"),
  stage: z.string().optional().describe("block_for_human: 멈춘 파이프라인 상태"),
  resumeAction: z.string().optional().describe("block_for_human: 결정 반영 뒤 다시 시도할 sugo_plan action"),
  blockerSummary: z.string().optional().describe("block_for_human: 무엇을 하다가 멈췄는지 한 문장"),
  question: z.string().optional().describe("block_for_human: 사람이 답해야 할 정확한 질문"),
  context: z.array(z.string()).optional().describe("block_for_human: 판단에 필요한 사실 목록"),
  options: z.array(z.object({ id: z.string(), label: z.string(), impact: z.string() })).optional().describe("block_for_human: 선택지와 각 영향"),
  blockedNextStep: z.string().optional().describe("block_for_human: 결정 전에는 진행할 수 없는 다음 단계"),
};

const SugoRoadmapArgs = z.object(sugoRoadmapInputSchema);

export async function handleSugoRoadmap(rawArgs: unknown) {
  const args = SugoRoadmapArgs.parse(rawArgs);

  switch (args.action) {
    case "add": {
      if (!args.id || !args.title || !args.level) {
        return errorResult("ADD_FIELDS_REQUIRED", "add action에는 id/title/level이 필요합니다.");
      }
      const result = await addRoadmapNode(args.workspace, {
        id: args.id,
        title: args.title,
        level: args.level,
        status: "pending",
        dependsOn: args.dependsOn ?? [],
        parent: args.parent,
        ref: args.ref,
        specPath: args.specPath,
        note: args.note,
      });
      if (!result.ok) return errorResult(result.error!, result.message!);
      return ok({ node: await getRoadmapNode(args.workspace, args.id) });
    }
    case "remove": {
      if (!args.id) return errorResult("ID_REQUIRED", "remove action에는 id가 필요합니다.");
      const result = await removeRoadmapNode(args.workspace, args.id);
      if (!result.ok) return errorResult(result.error!, result.message!);
      return ok({});
    }
    case "status": {
      if (!args.id || !args.status) return errorResult("ID_AND_STATUS_REQUIRED", "status action에는 id와 status가 필요합니다.");
      const result = await updateRoadmapNodeStatus(args.workspace, args.id, args.status, resultFrom(args));
      if (!result.ok) return errorResult(result.error!, result.message!);
      return ok({ node: await getRoadmapNode(args.workspace, args.id) });
    }
    case "link": {
      if (!args.fromId || !args.toId) return errorResult("FROM_TO_REQUIRED", "link action에는 fromId와 toId가 필요합니다.");
      const result = await linkRoadmapNodes(args.workspace, args.fromId, args.toId);
      if (!result.ok) return errorResult(result.error!, result.message!);
      return ok({});
    }
    case "unlink": {
      if (!args.fromId || !args.toId) return errorResult("FROM_TO_REQUIRED", "unlink action에는 fromId와 toId가 필요합니다.");
      const result = await unlinkRoadmapNodes(args.workspace, args.fromId, args.toId);
      if (!result.ok) return errorResult(result.error!, result.message!);
      return ok({});
    }
    case "group": {
      if (!args.id || !args.title || !args.taskIds) {
        return errorResult("GROUP_FIELDS_REQUIRED", "group action에는 id(workstream id)/title/taskIds가 필요합니다.");
      }
      await groupRoadmapNodes(args.workspace, args.id, args.title, args.taskIds);
      return ok({});
    }
    case "backfill": {
      if (!args.id || !args.title) return errorResult("BACKFILL_FIELDS_REQUIRED", "backfill action에는 id(HULK taskId)/title이 필요합니다.");
      await backfillRoadmapTask(args.workspace, args.id, args.title);
      return ok({ node: await getRoadmapNode(args.workspace, args.id) });
    }
    case "list": {
      const nodes = await listRoadmapNodes(args.workspace, { level: args.filterLevel, parent: args.filterParent });
      return ok({ nodes });
    }
    case "ready": {
      const ready = await getReadySet(args.workspace);
      return ok({ ready });
    }
    case "pull_ordering": {
      const pulled = await pullRoadmapOrdering(args.workspace);
      return ok({ pulled });
    }
    case "block_for_human": {
      if (!args.id || !args.sessionId || !args.stage || !args.resumeAction || !args.blockerSummary || !args.question || !args.blockedNextStep) {
        return errorResult("HUMAN_BLOCKER_FIELDS_REQUIRED", "사람 차단에는 id/sessionId/stage/resumeAction/blockerSummary/question/blockedNextStep이 필요합니다.");
      }
      if (!(await sessionExists(args.sessionId))) return errorResult("SESSION_NOT_FOUND", `세션을 찾을 수 없습니다: ${args.sessionId}`);
      const session = await loadSession(args.sessionId);
      if (session.data.hulkWorkspace !== args.workspace || session.data.hulkTaskId !== args.id) {
        return errorResult("BLOCKER_TARGET_MISMATCH", "현재 세션에 연결된 워크스페이스/Task와 차단 대상이 다릅니다.");
      }
      const blocker = {
        schemaVersion: 1,
        sessionId: args.sessionId,
        stage: args.stage,
        resumeAction: args.resumeAction,
        summary: args.blockerSummary,
        question: args.question,
        context: args.context ?? [],
        options: args.options ?? [],
        blockedNextStep: args.blockedNextStep,
        createdAt: new Date().toISOString(),
      } as const;
      const result = await blockRoadmapNodeForHuman(args.workspace, args.id, blocker);
      if (!result.ok) return errorResult(result.error!, result.message!);
      session.data.humanDecisionGate = { workspace: args.workspace, taskId: args.id, blocker };
      await saveSession(session);
      await updateRoadmapNodeRuntimeAssessment(args.workspace, args.id, assessSession(session));
      return ok({ awaitingHumanDecision: true, node: await getRoadmapNode(args.workspace, args.id) });
    }
    case "resume_with_decision": {
      if (!args.id || !args.sessionId) return errorResult("ID_AND_SESSION_REQUIRED", "재개에는 id와 sessionId가 필요합니다.");
      if (!(await sessionExists(args.sessionId))) return errorResult("SESSION_NOT_FOUND", `세션을 찾을 수 없습니다: ${args.sessionId}`);
      const session = await loadSession(args.sessionId);
      const gate = session.data.humanDecisionGate;
      if (!gate || gate.workspace !== args.workspace || gate.taskId !== args.id) {
        return errorResult("HUMAN_DECISION_GATE_NOT_FOUND", "현재 세션에는 이 워크스페이스/Task에 대한 사람 결정 차단이 없습니다.");
      }
      const remote = await fetchBlockerDecision(args.workspace, args.id);
      if (!remote?.decision?.response) return errorResult("HUMAN_DECISION_PENDING", "대시보드에 아직 사용자 결정이 저장되지 않았습니다.");
      if (remote.blocker?.sessionId && remote.blocker.sessionId !== args.sessionId) {
        return errorResult("BLOCKER_SESSION_MISMATCH", "대시보드 차단을 만든 세션과 현재 세션이 다릅니다.");
      }
      const result = await resumeRoadmapNodeWithDecision(args.workspace, args.id, args.sessionId, remote.decision.response);
      if (!result.ok) return errorResult(result.error!, result.message!);
      session.data.humanDecisionGate = undefined;
      session.data.commitContext = {
        ...(typeof session.data.commitContext === "object" && session.data.commitContext !== null ? session.data.commitContext : {}),
        lastHumanDecision: remote.decision,
      };
      await saveSession(session);
      await updateRoadmapNodeRuntimeAssessment(args.workspace, args.id, assessSession(session));
      return ok({
        decision: remote.decision,
        resumeAction: remote.blocker?.resumeAction,
        node: await getRoadmapNode(args.workspace, args.id),
      });
    }
    case "get": {
      if (!args.id) return errorResult("ID_REQUIRED", "get action에는 id가 필요합니다.");
      const node = await getRoadmapNode(args.workspace, args.id);
      if (!node) return errorResult("NODE_NOT_FOUND", `노드를 찾을 수 없습니다: ${args.id}`);
      return ok({ node });
    }
    case "mark_req": {
      if (!args.id) return errorResult("ID_REQUIRED", "mark_req action에는 id가 필요합니다.");
      const result = await markRequirementDone(args.workspace, args.id, resultFrom(args));
      if (!result.ok) return errorResult(result.error!, result.message!);
      return ok({ node: await getRoadmapNode(args.workspace, args.id) });
    }
  }
}

function resultFrom(args: z.infer<typeof SugoRoadmapArgs>) {
  if (!args.resultSummary && !args.logId) return undefined;
  return { summary: args.resultSummary, logId: args.logId };
}

function ok(payload: object) {
  return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, ...payload }, null, 2) }] };
}

function errorResult(errorCode: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode, message }, null, 2) }],
  };
}
