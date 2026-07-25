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
} from "../hulk/roadmap.js";
import { ROADMAP_LEVELS, ROADMAP_NODE_STATUSES } from "../hulk/types.js";

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
