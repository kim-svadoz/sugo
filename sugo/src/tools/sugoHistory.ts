import { z } from "zod";
import { addWorkLog, getWorkLog, listWorkLogs } from "../work/history.js";

export const sugoHistoryInputSchema = {
  action: z.enum(["add", "list", "get"]),
  workspace: z.string().describe("워크스페이스 이름"),
  logId: z.string().optional().describe("get action에 필요"),
  task_id: z.string().optional().describe("add action에 필요"),
  task_title: z.string().optional().describe("add action에 필요"),
  summary: z.string().optional(),
  key_decisions: z.array(z.string()).optional(),
  files_changed: z.array(z.string()).optional(),
  commits: z.array(z.string()).optional(),
  estimatedHumanHours: z.number().optional(),
  userReportedHumanHours: z.number().optional(),
  aiExecutionMinutes: z.number().optional(),
};

const SugoHistoryArgs = z.object(sugoHistoryInputSchema);

/** sugo_plan(commit)이 워크스페이스 프로젝트에 대해 자동으로 WorkLog를 남기지만, 이 도구로
 * 수동 기록(파이프라인 밖 작업, patch 흐름 등)도 가능하다(§8). */
export async function handleSugoHistory(rawArgs: unknown) {
  const args = SugoHistoryArgs.parse(rawArgs);

  switch (args.action) {
    case "add": {
      if (!args.task_id || !args.task_title) {
        return errorResult("TASK_ID_AND_TITLE_REQUIRED", "add action에는 task_id와 task_title이 필요합니다.");
      }
      const workLog = await addWorkLog(args.workspace, {
        task_id: args.task_id,
        task_title: args.task_title,
        completed_at: new Date().toISOString(),
        summary: args.summary,
        key_decisions: args.key_decisions,
        files_changed: args.files_changed,
        commits: args.commits,
        metrics: {
          estimatedHumanHours: args.estimatedHumanHours,
          userReportedHumanHours: args.userReportedHumanHours,
          aiExecutionMinutes: args.aiExecutionMinutes,
        },
      });
      return ok({ workLog });
    }
    case "list": {
      const workLogs = await listWorkLogs(args.workspace);
      return ok({ workLogs });
    }
    case "get": {
      if (!args.logId) return errorResult("LOG_ID_REQUIRED", "get action에는 logId가 필요합니다.");
      const workLog = await getWorkLog(args.workspace, args.logId);
      if (!workLog) return errorResult("WORKLOG_NOT_FOUND", `WorkLog를 찾을 수 없습니다: ${args.logId}`);
      return ok({ workLog });
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
