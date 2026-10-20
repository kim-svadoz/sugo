import { readFile } from "node:fs/promises";
import { drainRetryQueue } from "./client.js";
import {
  syncCheckpoint,
  syncHistory,
  syncRoadmapSnapshot,
  syncSpec,
  syncTask,
  syncWorkspace,
} from "./sync.js";
import { listCheckpoints } from "../work/checkpoint.js";
import { listWorkLogs } from "../work/history.js";
import { backfillLegacyRoadmapWorkResults, listRoadmapNodes, reconcileRoadmapWithTasks } from "../work/roadmap.js";
import { listSpecs } from "../work/spec.js";
import { listTasks } from "../work/task.js";
import { listWorkspaces } from "../work/workspace.js";

export interface FullSyncResult {
  workspaceCount: number;
  taskCount: number;
  roadmapNodeCount: number;
  checkpointCount: number;
  historyCount: number;
  specCount: number;
}

/**
 * 로컬 파일 정본을 Dashboard에 전량 반영한다.
 *
 * 개별 작업 이벤트는 평소 즉시 push한다. 이 함수는 Console이 꺼져 있었거나 DB가 교체된 동안
 * 놓친 이벤트를 세션 시작 시 복구하는 안전망이다. Schedule 메모·보관함·수동 배치처럼 Dashboard가
 * 소유한 데이터는 건드리지 않는다.
 */
export async function syncAllWorkspaceData(): Promise<FullSyncResult> {
  const result: FullSyncResult = {
    workspaceCount: 0,
    taskCount: 0,
    roadmapNodeCount: 0,
    checkpointCount: 0,
    historyCount: 0,
    specCount: 0,
  };

  const workspaces = await listWorkspaces();
  result.workspaceCount = workspaces.length;
  for (const workspace of workspaces) {
    await syncWorkspace(workspace);

    const tasks = await listTasks(workspace.name);
    await reconcileRoadmapWithTasks(workspace.name, tasks);
    await backfillLegacyRoadmapWorkResults(workspace.name, tasks);
    for (const task of tasks) await syncTask(workspace.name, task);
    result.taskCount += tasks.length;

    const roadmap = await listRoadmapNodes(workspace.name);
    await syncRoadmapSnapshot(workspace.name, roadmap);
    result.roadmapNodeCount += roadmap.length;

    const checkpoints = await listCheckpoints(workspace.name);
    for (const checkpoint of checkpoints) await syncCheckpoint(workspace.name, checkpoint);
    result.checkpointCount += checkpoints.length;

    const history = await listWorkLogs(workspace.name);
    for (const log of history) await syncHistory(workspace.name, log);
    result.historyCount += history.length;

    const specs = await listSpecs(workspace.name);
    for (const spec of specs) await syncSpec(workspace.name, spec);
    result.specCount += specs.length;

    // 정식 장기 Spec이 없던 옛 작업도 Canvas의 원문에서 끊기지 않게 한다.
    const specNames = new Set(specs.map((spec) => spec.name));
    for (const task of tasks) {
      if (!task.prd_ref || specNames.has(task.title)) continue;
      const content = await readFile(task.prd_ref, "utf8").catch(() => null);
      if (!content) continue;
      await syncSpec(workspace.name, {
        name: task.title,
        type: "other",
        tags: ["prd-fallback"],
        content,
        created_at: task.created_at,
      });
      specNames.add(task.title);
      result.specCount += 1;
    }
  }

  await drainRetryQueue();
  return result;
}
