import { z } from "zod";
import { addTask, getTask, listTasks, updateTask } from "../work/task.js";
import { loadAllSessions } from "../session.js";
import { sessionForTask } from "../work/sessionSummary.js";

const TASK_STATUS = ["pending", "idea", "in_progress", "done", "dropped", "archived"] as const;

export const sugoTaskInputSchema = {
  action: z.enum(["add", "list", "update", "get"]),
  workspace: z.string().describe("워크스페이스 이름"),
  taskId: z.string().optional().describe("update/get action에 필요"),
  title: z.string().optional().describe("add action에 필요"),
  project: z.string().optional().describe("add action에 필요"),
  status: z.enum(TASK_STATUS).optional(),
  priority: z.string().optional(),
  description: z.string().optional(),
  summary: z.string().optional(),
  prd_ref: z.string().optional(),
  tags: z.array(z.string()).optional(),
  filterProject: z.string().optional().describe("list: project로 필터"),
};

const SugoTaskArgs = z.object(sugoTaskInputSchema);

export async function handleSugoTask(rawArgs: unknown) {
  const args = SugoTaskArgs.parse(rawArgs);

  switch (args.action) {
    case "add": {
      if (!args.title || !args.project) return errorResult("TITLE_AND_PROJECT_REQUIRED", "add action에는 title과 project가 필요합니다.");
      const task = await addTask(args.workspace, {
        title: args.title,
        project: args.project,
        status: args.status,
        priority: args.priority,
        description: args.description,
        prd_ref: args.prd_ref,
        tags: args.tags,
      });
      return ok({ task });
    }
    case "list": {
      const tasks = await listTasks(args.workspace, { project: args.filterProject, status: args.status });
      return ok({ tasks });
    }
    case "update": {
      if (!args.taskId) return errorResult("TASK_ID_REQUIRED", "update action에는 taskId가 필요합니다.");
      const task = await updateTask(args.workspace, args.taskId, { status: args.status, summary: args.summary });
      if (!task) return errorResult("TASK_NOT_FOUND", `태스크를 찾을 수 없습니다: ${args.taskId}`);
      // task와 session은 자동 동기화하지 않는다 — 사람이 태스크를 닫았다고 파이프라인이 끝난 건
      // 아니다. 대신 연결 세션 상태를 함께 실어 한쪽만 보고 오판하지 않게 한다.
      const linkedSession = sessionForTask(await loadAllSessions(), args.taskId);
      return ok({ task, linkedSession });
    }
    case "get": {
      if (!args.taskId) return errorResult("TASK_ID_REQUIRED", "get action에는 taskId가 필요합니다.");
      const task = await getTask(args.workspace, args.taskId);
      if (!task) return errorResult("TASK_NOT_FOUND", `태스크를 찾을 수 없습니다: ${args.taskId}`);
      const linkedSessionForGet = sessionForTask(await loadAllSessions(), args.taskId);
      return ok({ task, linkedSession: linkedSessionForGet });
    }
  }
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
