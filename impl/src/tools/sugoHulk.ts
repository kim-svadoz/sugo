import { z } from "zod";
import { drainRetryQueue } from "../dashboard/client.js";
import { resolveDashboardConfig } from "../dashboard/config.js";
import { listRetryQueue } from "../dashboard/retryQueue.js";
import { syncRoadmapSnapshot, syncTask, syncWorkspace } from "../dashboard/sync.js";
import { listCheckpoints } from "../hulk/checkpoint.js";
import { listWorkLogs } from "../hulk/history.js";
import { listRoadmapNodes } from "../hulk/roadmap.js";
import { listSpecs } from "../hulk/spec.js";
import { listTasks } from "../hulk/task.js";
import { loadWorkspace } from "../hulk/workspace.js";
import { computeJudgmentReport } from "../judgment.js";
import { loadAllSessions } from "../session.js";

export const sugoHulkInputSchema = {
  action: z.enum(["enable", "disable", "status", "help", "sync", "health", "judgment"]),
  workspace: z.string().optional().describe("status/sync action에 필요"),
  windowDays: z.number().optional().describe("judgment action: 최근 N일 이내 갱신된 세션만 집계"),
};

const SugoHulkArgs = z.object(sugoHulkInputSchema);

const HULK_HELP_TEXT = [
  "HULK(§8) — 워크스페이스 기반 태스크·체크포인트·스펙·이력·로드맵 관리.",
  "",
  "개념: Spec ⊃ Run ⊃ Task ⊃ REQ ⊃ step. Workspace는 관련 프로젝트 묶음.",
  "Task는 sugo_plan(prd)이 자동 생성/재사용(§7.1 patch). Checkpoint는 커밋 전 재발방지 체크리스트.",
  "Roadmap DAG(sugo_roadmap)이 Task/REQ의 실행 순서를 관리한다.",
  "",
  "이 도구의 action: enable/disable(HULK는 항상 켜져 있어 둘 다 no-op) · status(워크스페이스 요약)",
  "· help(이 텍스트) · sync(워크스페이스/태스크/로드맵을 대시보드로 다시 push) ·",
  "health(대시보드 연결 상태·재시도 큐 크기) · judgment(§4.5 판단품질 리포트).",
].join("\n");

/**
 * §8 sugo_hulk: 원본 v1 스펙이 나열한 통합 도구. `sugo_judgment_report`를 judgment action으로
 * 흡수한다(§9 "sugo_judgment_report를 sugo_hulk(action:'judgment')로 통합"). enable/disable은
 * HULK가부터 내장 상수로 항상 켜져 있다는 설계를 그대로 반영해 no-op이다(토글 자체가 무력).
 */
export async function handleSugoHulk(rawArgs: unknown) {
  const args = SugoHulkArgs.parse(rawArgs);

  switch (args.action) {
    case "enable":
      return ok({ message: "HULK는 항상 켜져 있습니다( 내장 상수) — enable은 아무 것도 바꾸지 않습니다." });
    case "disable":
      return ok({ message: "HULK는 항상 켜져 있어 끌 수 없습니다( 내장 상수) — disable은 아무 것도 바꾸지 않습니다." });
    case "help":
      return ok({ help: HULK_HELP_TEXT });
    case "status": {
      if (!args.workspace) return errorResult("WORKSPACE_REQUIRED", "status action에는 workspace가 필요합니다.");
      const [tasks, checkpoints, roadmapNodes, specs, history] = await Promise.all([
        listTasks(args.workspace),
        listCheckpoints(args.workspace),
        listRoadmapNodes(args.workspace),
        listSpecs(args.workspace),
        listWorkLogs(args.workspace),
      ]);
      return ok({
        workspace: args.workspace,
        taskCount: tasks.length,
        checkpointCount: checkpoints.length,
        roadmapNodeCount: roadmapNodes.length,
        specCount: specs.length,
        historyCount: history.length,
      });
    }
    case "health": {
      const config = await resolveDashboardConfig();
      const queue = await listRetryQueue();
      return ok({ dashboardEnabled: config.enabled, dashboardApiUrl: config.apiUrl, retryQueueSize: queue.length });
    }
    case "sync": {
      if (!args.workspace) return errorResult("WORKSPACE_REQUIRED", "sync action에는 workspace가 필요합니다.");
      const ws = await loadWorkspace(args.workspace);
      if (ws) void syncWorkspace(ws);
      const tasks = await listTasks(args.workspace);
      for (const task of tasks) void syncTask(args.workspace, task);
      const nodes = await listRoadmapNodes(args.workspace);
      void syncRoadmapSnapshot(args.workspace, nodes);
      await drainRetryQueue();
      return ok({ synced: true, taskCount: tasks.length, roadmapNodeCount: nodes.length });
    }
    case "judgment": {
      const allSessions = await loadAllSessions();
      const sessions =
        args.windowDays === undefined
          ? allSessions
          : allSessions.filter((s) => Date.now() - new Date(s.updatedAt).getTime() <= args.windowDays! * 24 * 60 * 60 * 1000);
      const report = computeJudgmentReport(sessions);
      return ok({ report });
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
