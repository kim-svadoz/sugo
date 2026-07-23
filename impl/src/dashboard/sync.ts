import { pushEvent } from "./client.js";
import { resolveDashboardConfig } from "./config.js";
import type { RoadmapNode, Task, Workspace } from "../hulk/types.js";

/**
 * §7.2 push 엔드포인트 얇은 래퍼들 — 호출부(hulk/*.ts, tools/sugoPlan.ts)는 로컬 쓰기가 끝난 뒤
 * `void syncXxx(...)`처럼 기다리지 않고 호출한다. pushEvent 자체가 disabled/실패를 조용히
 * 흡수하므로 이 래퍼들도 절대 던지지 않는다.
 */

export async function syncWorkspace(ws: Workspace): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/workspace", "POST", {
    userId: config.userId,
    name: ws.name,
    projects: ws.projects,
    gitSyncedProjects: [],
    createdAt: ws.created_at,
    updatedAt: new Date().toISOString(),
  });
}

export async function syncTask(workspaceName: string, task: Task): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/task", "POST", { userId: config.userId, workspaceName, task });
}

/** §7.2 "노드 스냅샷 replace" — 부분 patch가 아니라 매번 전체 노드 목록을 통째로 보낸다(대시보드가 diff한다). */
export async function syncRoadmapSnapshot(workspaceName: string, nodes: RoadmapNode[]): Promise<void> {
  const config = await resolveDashboardConfig();
  if (!config.enabled) return;
  await pushEvent("/api/sync/roadmap", "POST", { userId: config.userId, workspaceName, nodes });
}
