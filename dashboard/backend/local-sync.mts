/** 기존 ~/.claude/sugo 데이터를 실행 중인 로컬 Dashboard API로 전량 동기화한다. */
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { listCheckpoints } from "../../sugo/src/work/checkpoint.js";
import { listWorkLogs } from "../../sugo/src/work/history.js";
import { backfillLegacyRoadmapWorkResults, listRoadmapNodes, reconcileRoadmapWithTasks } from "../../sugo/src/work/roadmap.js";
import { listSpecs } from "../../sugo/src/work/spec.js";
import { listTasks } from "../../sugo/src/work/task.js";
import { listWorkspaces } from "../../sugo/src/work/workspace.js";
import {
  syncCheckpoint,
  syncDecision,
  syncHistory,
  syncPluginVersion,
  syncRoadmapSnapshot,
  syncTask,
  syncUser,
  syncWorkspace,
} from "../../sugo/src/dashboard/sync.js";
import { drainRetryQueue } from "../../sugo/src/dashboard/client.js";

await syncUser();
// 이 스크립트는 번들 밖(tsx)에서 실행되므로 __SUGO_VERSION__이 없고 version.ts의
// 개발 폴백(0.0.0-dev)이 나온다. 실제 설치 소스의 package.json을 진실로 사용한다.
const pluginVersion = (JSON.parse(readFileSync(new URL("../../sugo/package.json", import.meta.url), "utf8")) as { version: string }).version;
await syncPluginVersion(pluginVersion);

const workspaces = await listWorkspaces();
let taskCount = 0;
let roadmapNodeCount = 0;
let checkpointCount = 0;
let historyCount = 0;
let specCount = 0;

for (const workspace of workspaces) {
  await syncWorkspace(workspace);

  const tasks = await listTasks(workspace.name);
  await reconcileRoadmapWithTasks(workspace.name, tasks);
  await backfillLegacyRoadmapWorkResults(workspace.name, tasks);
  for (const task of tasks) await syncTask(workspace.name, task);
  taskCount += tasks.length;

  const roadmap = await listRoadmapNodes(workspace.name);
  await syncRoadmapSnapshot(workspace.name, roadmap);
  roadmapNodeCount += roadmap.length;

  const checkpoints = await listCheckpoints(workspace.name);
  for (const checkpoint of checkpoints) await syncCheckpoint(workspace.name, checkpoint);
  checkpointCount += checkpoints.length;

  const history = await listWorkLogs(workspace.name);
  for (const log of history) await syncHistory(workspace.name, log);
  historyCount += history.length;

  const specs = await listSpecs(workspace.name);
  for (const spec of specs) await syncDecision(workspace.name, spec);
  specCount += specs.length;

  // 정식 장기 Spec이 없던 옛 작업도 Canvas의 "원문"에서 끊기지 않게 한다.
  // Task가 실제로 기록한 prd_ref만 읽으며, 같은 이름의 정식 Spec이 있으면 그것이 우선한다.
  const specNames = new Set(specs.map((spec) => spec.name));
  for (const task of tasks) {
    if (!task.prd_ref || specNames.has(task.title)) continue;
    const content = await readFile(task.prd_ref, "utf8").catch(() => null);
    if (!content) continue;
    await syncDecision(workspace.name, {
      name: task.title,
      type: "other",
      tags: ["prd-fallback"],
      content,
      created_at: task.created_at,
    });
    specNames.add(task.title);
    specCount += 1;
  }
}

await drainRetryQueue();
console.log(
  `[local-sync] workspaces=${workspaces.length} tasks=${taskCount} roadmap=${roadmapNodeCount} checkpoints=${checkpointCount} history=${historyCount} specs=${specCount}`,
);
