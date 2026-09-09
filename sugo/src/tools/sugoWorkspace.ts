import { z } from "zod";
import { drainRetryQueue } from "../dashboard/client.js";
import { resolveDashboardConfig } from "../dashboard/config.js";
import { syncRoadmapSnapshot, syncTask, syncWorkspace } from "../dashboard/sync.js";
import { listCheckpoints } from "../hulk/checkpoint.js";
import { listWorkLogs } from "../hulk/history.js";
import { appendMemory, readMemory } from "../hulk/memory.js";
import { listRoadmapNodes } from "../hulk/roadmap.js";
import { listSpecs } from "../hulk/spec.js";
import { listTasks } from "../hulk/task.js";
import { deleteWorkspace, ensureWorkspace, listWorkspaces, loadWorkspace } from "../hulk/workspace.js";

/**
 * §1/§9 `sugo_workspace`. 워크스페이스에 대한 조작은 전부 여기 모은다 — `status`(데이터 요약)와
 * `sync`(대시보드 재push)도 포함이다.
 *
 * ⚠️ `sync`는 스펙 도구 표의 action 목록(list/create/delete/status)에 없지만, "대시보드와
 * 어긋났을 때 수동으로 다시 밀어넣는" 실동작 기능이라 의도적으로 유지한다.
 */
export const sugoWorkspaceInputSchema = {
  action: z.enum(["add", "list", "get", "remember", "recall", "status", "sync", "delete"]),
  name: z.string().optional().describe("add/get/remember/recall/status/sync/delete action에 필요"),
  projectPath: z.string().optional().describe("add: 이 워크스페이스에 추가로 소속시킬 프로젝트 경로"),
  note: z.string().optional().describe("remember action에 필요"),
  includeDeleted: z.boolean().optional().describe("list: soft delete된 워크스페이스도 함께 보여준다"),
  purge: z.boolean().optional().describe("delete: 하드 삭제(기본은 soft — 숨기기만 하고 데이터 보존)"),
  force: z.boolean().optional().describe("delete: 연결된 프로젝트가 있어도 하드 삭제를 진행한다"),
  keep_data: z.boolean().optional().describe("delete: purge여도 디스크의 워크스페이스 디렉터리는 남긴다"),
};

const SugoWorkspaceArgs = z.object(sugoWorkspaceInputSchema);

export async function handleSugoWorkspace(rawArgs: unknown) {
  const args = SugoWorkspaceArgs.parse(rawArgs);

  switch (args.action) {
    case "add": {
      if (!args.name) return errorResult("NAME_REQUIRED", "add action에는 name이 필요합니다.");
      const workspace = await ensureWorkspace(args.name, args.projectPath);
      return ok({ workspace });
    }
    case "list": {
      const workspaces = await listWorkspaces(args.includeDeleted ?? false);
      return ok({ workspaces });
    }
    case "delete": {
      if (!args.name) return errorResult("NAME_REQUIRED", "delete action에는 name이 필요합니다.");
      const result = await deleteWorkspace(args.name, {
        purge: args.purge,
        force: args.force,
        keepData: args.keep_data,
      });
      if (!result.ok) return errorResult(result.errorCode!, result.message!);
      return ok({
        workspace: args.name,
        mode: result.mode,
        alreadyDeleted: result.alreadyDeleted,
        dataRemoved: result.dataRemoved,
        // soft는 되살릴 수 있다는 걸 응답에서 바로 알려준다 — 몰라서 purge를 쓰는 게 최악이다.
        note:
          result.mode === "soft"
            ? "데이터는 보존됐습니다. 같은 이름으로 다시 add하면 복구됩니다."
            : "하드 삭제되어 복구할 수 없습니다.",
      });
    }
    case "get": {
      if (!args.name) return errorResult("NAME_REQUIRED", "get action에는 name이 필요합니다.");
      const workspace = await loadWorkspace(args.name);
      if (!workspace) return errorResult("WORKSPACE_NOT_FOUND", `워크스페이스를 찾을 수 없습니다: ${args.name}`);
      return ok({ workspace });
    }
    case "remember": {
      if (!args.name || !args.note) return errorResult("NAME_AND_NOTE_REQUIRED", "remember action에는 name과 note가 필요합니다.");
      await appendMemory(args.name, args.note);
      return ok({ remembered: true });
    }
    case "recall": {
      if (!args.name) return errorResult("NAME_REQUIRED", "recall action에는 name이 필요합니다.");
      const memory = await readMemory(args.name);
      return ok({ memory });
    }
    case "status": {
      if (!args.name) return errorResult("NAME_REQUIRED", "status action에는 name이 필요합니다.");
      const [tasks, checkpoints, roadmapNodes, specs, history] = await Promise.all([
        listTasks(args.name),
        listCheckpoints(args.name),
        listRoadmapNodes(args.name),
        listSpecs(args.name),
        listWorkLogs(args.name),
      ]);
      return ok({
        workspace: args.name,
        taskCount: tasks.length,
        checkpointCount: checkpoints.length,
        roadmapNodeCount: roadmapNodes.length,
        specCount: specs.length,
        historyCount: history.length,
      });
    }
    case "sync": {
      if (!args.name) return errorResult("NAME_REQUIRED", "sync action에는 name이 필요합니다.");
      const ws = await loadWorkspace(args.name);
      if (ws) void syncWorkspace(ws);
      const tasks = await listTasks(args.name);
      for (const task of tasks) void syncTask(args.name, task);
      const nodes = await listRoadmapNodes(args.name);
      void syncRoadmapSnapshot(args.name, nodes);
      // push는 fire-and-forget이라 여기서 큐를 한 바퀴 돌려야 "수동 재sync"가 실제로 나간다.
      await drainRetryQueue();
      // 대시보드 미설정이면 위 push들은 전부 조용한 no-op이다 — `synced: true`는 거짓 보고가
      // 된다(checkpoint sync와 같은 이유로 정정).
      const config = await resolveDashboardConfig();
      if (!config.enabled) {
        return ok({
          synced: false,
          dashboard: "disabled",
          taskCount: tasks.length,
          roadmapNodeCount: nodes.length,
          note: "대시보드가 설정되지 않아 전송하지 않았습니다. 로컬 데이터는 그대로 남아 있습니다.",
        });
      }
      return ok({ synced: true, dashboard: "enabled", taskCount: tasks.length, roadmapNodeCount: nodes.length });
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
