import type { DbClient } from "../db/client.js";
import { ensureWorkspaceDeletedAtColumn } from "./syncService.js";
import { readySet, topoSort, wouldCreateCycle } from "./roadmapGraph.js";
import { parseJsonArray, parseMaybeJson } from "../db/jsonColumn.js";

export interface WorkspaceProjectRow {
  project_path: string;
  git_synced: number;
}

export interface TaskCounts {
  pending: number;
  in_progress: number;
  done: number;
  archived: number;
}

export interface RoadmapCounts {
  total: number;
  done: number;
  active: number;
}

export interface WorkspaceSummary {
  name: string;
  projects: WorkspaceProjectRow[];
  taskCounts: TaskCounts;
  roadmap: RoadmapCounts;
}

// 설계안: roadmap count는 level='task'만, active는 COALESCE(manual_status,status)='in_progress'.
async function roadmapCounts(db: DbClient, userId: string, workspaceName: string): Promise<RoadmapCounts> {
  const rows = await db.query<{ status: string; manual_status: string | null }>(
    "SELECT status, manual_status FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND level = 'task'",
    [userId, workspaceName]
  );
  let done = 0;
  let active = 0;
  for (const r of rows) {
    const effective = r.manual_status ?? r.status;
    if (effective === "done") done++;
    if (effective === "in_progress") active++;
  }
  return { total: rows.length, done, active };
}

async function taskCounts(db: DbClient, userId: string, workspaceName: string): Promise<TaskCounts> {
  const rows = await db.query<{ status: string; n: number }>(
    "SELECT status, COUNT(*) as n FROM sugo_tasks WHERE user_id = ? AND workspace_name = ? GROUP BY status",
    [userId, workspaceName]
  );
  const counts: TaskCounts = { pending: 0, in_progress: 0, done: 0, archived: 0 };
  for (const r of rows) {
    if (r.status in counts) counts[r.status as keyof TaskCounts] = Number(r.n);
  }
  return counts;
}

export async function listWorkspaces(db: DbClient, userId: string): Promise<WorkspaceSummary[]> {
  // §4 soft delete 필터. 컬럼이 없으면(코드가 마이그레이션보다 먼저 배포된 경우) 필터를 생략해
  // 전부 노출한다 — 여기서 500을 내면 대시보드 전체가 멈춘다(graceful degrade).
  const hasDeletedCol = await ensureWorkspaceDeletedAtColumn(db);
  const workspaces = await db.query<{ id: number; name: string }>(
    hasDeletedCol
      ? "SELECT id, name FROM sugo_workspaces WHERE user_id = ? AND deleted_at IS NULL ORDER BY name"
      : "SELECT id, name FROM sugo_workspaces WHERE user_id = ? ORDER BY name",
    [userId]
  );
  const result: WorkspaceSummary[] = [];
  for (const ws of workspaces) {
    const projects = await db.query<WorkspaceProjectRow>(
      "SELECT project_path, git_synced FROM sugo_workspace_projects WHERE workspace_id = ? ORDER BY project_path",
      [ws.id]
    );
    result.push({
      name: ws.name,
      projects,
      taskCounts: await taskCounts(db, userId, ws.name),
      roadmap: await roadmapCounts(db, userId, ws.name),
    });
  }
  return result;
}

export interface HistoryRow {
  id: string;
  workspace_name: string;
  task_id: string | null;
  task_title: string | null;
  summary: string | null;
  completed_at: string | null;
  created_at: string;
}

export async function getRecentHistory(db: DbClient, userId: string, limit: number): Promise<HistoryRow[]> {
  return db.query<HistoryRow>(
    "SELECT id, workspace_name, task_id, task_title, summary, completed_at, created_at FROM sugo_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
    [userId, limit]
  );
}

export async function searchWorkspaces(db: DbClient, userId: string, q: string): Promise<HistoryRow[]> {
  const like = `%${q}%`;
  return db.query<HistoryRow>(
    `SELECT id, workspace_name, task_id, task_title, summary, completed_at, created_at
     FROM sugo_history
     WHERE user_id = ? AND (task_title LIKE ? OR summary LIKE ?)
     ORDER BY created_at DESC`,
    [userId, like, like]
  );
}

export interface CheckpointSyncRow {
  id: string;
  workspace_name: string;
  category: string;
  title: string;
  learned_from: string | null;
  checklist: unknown;
  applies_to: unknown;
}

function normalizeCheckpointRow<T extends { checklist: unknown; applies_to: unknown }>(row: T): T {
  return { ...row, checklist: parseMaybeJson<unknown>(row.checklist, null), applies_to: parseMaybeJson<unknown>(row.applies_to, null) };
}

export async function getCheckpointSync(db: DbClient, userId: string): Promise<CheckpointSyncRow[]> {
  const rows = await db.query<CheckpointSyncRow>(
    "SELECT id, workspace_name, category, title, learned_from, checklist, applies_to FROM sugo_checkpoints WHERE user_id = ? ORDER BY workspace_name, id",
    [userId]
  );
  return rows.map(normalizeCheckpointRow);
}

export async function getDecisions(db: DbClient, userId: string, workspaceName: string) {
  return db.query(
    "SELECT id, title, status, content, decision_date FROM sugo_decisions WHERE user_id = ? AND workspace_name = ? ORDER BY id",
    [userId, workspaceName]
  );
}

/**
 * §3.3 "GET /:name/spec-content?path=&title= — Spec 원문(slug 매칭)". 대시보드엔 spec 파일 원문을
 * 저장하는 테이블이 없다(§2) — 플러그인이 Spec을 ADR로 sync하므로(sugo_decisions), title 또는 id를
 * slug로 매칭해 decision content를 돌려준다. 없으면 null.
 */
export async function getSpecContent(
  db: DbClient,
  userId: string,
  workspaceName: string,
  title: string,
): Promise<{ title: string; content: string | null } | null> {
  const rows = await db.query<{ id: string; title: string; content: string | null }>(
    "SELECT id, title, content FROM sugo_decisions WHERE user_id = ? AND workspace_name = ? AND (id = ? OR title = ?) LIMIT 1",
    [userId, workspaceName, title, title],
  );
  if (rows.length === 0) return null;
  return { title: rows[0].title, content: rows[0].content };
}

export async function getHistory(db: DbClient, userId: string, workspaceName: string) {
  return db.query(
    "SELECT id, task_id, task_title, summary, completed_at, created_at FROM sugo_history WHERE user_id = ? AND workspace_name = ? ORDER BY created_at DESC",
    [userId, workspaceName]
  );
}

export async function getCheckpoints(db: DbClient, userId: string, workspaceName: string) {
  const rows = await db.query<{ id: string; category: string; title: string; learned_from: string | null; checklist: unknown; applies_to: unknown; checkpoint_date: string | null }>(
    "SELECT id, category, title, learned_from, checklist, applies_to, checkpoint_date FROM sugo_checkpoints WHERE user_id = ? AND workspace_name = ? ORDER BY id",
    [userId, workspaceName]
  );
  return rows.map(normalizeCheckpointRow);
}

export async function getTasks(db: DbClient, userId: string, workspaceName: string) {
  return db.query(
    "SELECT id, title, project, status, priority, description, summary, started_at, completed_at FROM sugo_tasks WHERE user_id = ? AND workspace_name = ? ORDER BY created_at",
    [userId, workspaceName]
  );
}

export interface RoadmapNodeRow {
  id: string;
  title: string;
  level: string;
  status: string;
  depends_on: string[];
  parent: string | null;
  ref: string | null;
  note: string | null;
  spec_path: string | null;
  work_result: unknown;
  lineage: unknown;
  manual_status: string | null;
  manual_by: string | null;
  manual_at: string | null;
  pos_x: number | null;
  pos_y: number | null;
}

// Row shape as it comes off the wire - JSON columns are driver-dependent
// (string on sqlite, already-parsed on mysql2); normalized below so the API
// response is identical regardless of DB_DRIVER.
type RoadmapNodeDbRow = Omit<RoadmapNodeRow, "depends_on" | "work_result" | "lineage"> & {
  depends_on: unknown;
  work_result: unknown;
  lineage: unknown;
};

export async function getRoadmap(db: DbClient, userId: string, workspaceName: string): Promise<RoadmapNodeRow[]> {
  const rows = await db.query<RoadmapNodeDbRow>(
    "SELECT * FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? ORDER BY id",
    [userId, workspaceName]
  );
  return rows.map((r) => ({
    ...r,
    depends_on: parseJsonArray(r.depends_on),
    work_result: parseMaybeJson<unknown>(r.work_result, null),
    lineage: parseMaybeJson<unknown>(r.lineage, null),
  }));
}

// ---- Checkpoint CRUD (§3.3, dashboard-initiated - separate from plugin sync) ----

export interface CreateCheckpointInput {
  id: string;
  category?: string;
  title: string;
  learnedFrom?: string | null;
  checklist?: unknown;
  appliesTo?: unknown;
  checkpointDate?: string | null;
}

export async function createCheckpoint(
  db: DbClient,
  userId: string,
  workspaceName: string,
  input: CreateCheckpointInput
): Promise<void> {
  await db.exec(
    `INSERT INTO sugo_checkpoints
     (id, user_id, workspace_name, category, title, learned_from, checklist, applies_to, checkpoint_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      userId,
      workspaceName,
      input.category ?? "general",
      input.title,
      input.learnedFrom ?? null,
      input.checklist !== undefined ? JSON.stringify(input.checklist) : null,
      input.appliesTo !== undefined ? JSON.stringify(input.appliesTo) : null,
      input.checkpointDate ?? null,
    ]
  );
}

export async function updateCheckpoint(
  db: DbClient,
  userId: string,
  workspaceName: string,
  id: string,
  input: Partial<CreateCheckpointInput>
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (input.category !== undefined) { sets.push("category = ?"); params.push(input.category); }
  if (input.title !== undefined) { sets.push("title = ?"); params.push(input.title); }
  if (input.learnedFrom !== undefined) { sets.push("learned_from = ?"); params.push(input.learnedFrom); }
  if (input.checklist !== undefined) { sets.push("checklist = ?"); params.push(JSON.stringify(input.checklist)); }
  if (input.appliesTo !== undefined) { sets.push("applies_to = ?"); params.push(JSON.stringify(input.appliesTo)); }
  if (input.checkpointDate !== undefined) { sets.push("checkpoint_date = ?"); params.push(input.checkpointDate); }
  if (sets.length === 0) return;
  params.push(userId, workspaceName, id);
  await db.exec(
    `UPDATE sugo_checkpoints SET ${sets.join(", ")} WHERE user_id = ? AND workspace_name = ? AND id = ?`,
    params
  );
}

export async function deleteCheckpointRow(
  db: DbClient,
  userId: string,
  workspaceName: string,
  id: string
): Promise<void> {
  await db.exec("DELETE FROM sugo_checkpoints WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    userId,
    workspaceName,
    id,
  ]);
}

// ---- Roadmap mutations (§3.3 "대시보드가 구조/순서 소유") ----

export type RoadmapMutationResult = { ok: true } | { ok: false; error: string; message: string };

async function loadGraphNodes(db: DbClient, userId: string, workspaceName: string) {
  const rows = await db.query<{ id: string; level: string; status: string; depends_on: unknown }>(
    "SELECT id, level, status, depends_on FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ?",
    [userId, workspaceName]
  );
  return rows.map((r) => ({ id: r.id, level: r.level, status: r.status, dependsOn: parseJsonArray(r.depends_on) }));
}

// §3.3: link/unlink는 task<->task만 허용(fail-closed), 사이클 생기면 거부.
export async function linkRoadmapNodes(
  db: DbClient,
  userId: string,
  workspaceName: string,
  fromId: string,
  toId: string
): Promise<RoadmapMutationResult> {
  const nodes = await loadGraphNodes(db, userId, workspaceName);
  const from = nodes.find((n) => n.id === fromId);
  const to = nodes.find((n) => n.id === toId);
  if (!from || !to) {
    return { ok: false, error: "NODE_NOT_FOUND", message: "fromId/toId 노드를 찾을 수 없습니다." };
  }
  if (from.level !== "task" || to.level !== "task") {
    return { ok: false, error: "LINK_REQUIRES_TASK_LEVEL", message: "link/unlink는 task 레벨 노드끼리만 허용됩니다." };
  }
  if (from.dependsOn.includes(toId)) return { ok: true };

  if (wouldCreateCycle(nodes, fromId, toId)) {
    return { ok: false, error: "CYCLE", message: `링크를 추가하면 사이클이 생깁니다: ${fromId} -> ${toId}` };
  }

  const newDeps = [...from.dependsOn, toId];
  await db.exec("UPDATE sugo_roadmap_nodes SET depends_on = ? WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    JSON.stringify(newDeps),
    userId,
    workspaceName,
    fromId,
  ]);
  return { ok: true };
}

export async function unlinkRoadmapNodes(
  db: DbClient,
  userId: string,
  workspaceName: string,
  fromId: string,
  toId: string
): Promise<RoadmapMutationResult> {
  const nodes = await loadGraphNodes(db, userId, workspaceName);
  const from = nodes.find((n) => n.id === fromId);
  if (!from) {
    return { ok: false, error: "NODE_NOT_FOUND", message: "fromId 노드를 찾을 수 없습니다." };
  }
  const newDeps = from.dependsOn.filter((id) => id !== toId);
  await db.exec("UPDATE sugo_roadmap_nodes SET depends_on = ? WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    JSON.stringify(newDeps),
    userId,
    workspaceName,
    fromId,
  ]);
  return { ok: true };
}

// group으로 workstream 묶기: 새 workstream 노드를 만들고 멤버들의 parent를 그 그룹으로.
// sequential이면 멤버 순서대로 dependsOn 체인을 건다(task 레벨 멤버만 해당).
export async function createRoadmapGroup(
  db: DbClient,
  userId: string,
  workspaceName: string,
  groupId: string,
  title: string,
  members: string[],
  sequential: boolean
): Promise<RoadmapMutationResult> {
  await db.exec(
    "INSERT INTO sugo_roadmap_nodes (id, user_id, workspace_name, title, level, status) VALUES (?, ?, ?, ?, 'workstream', 'pending')",
    [groupId, userId, workspaceName, title]
  );
  for (const memberId of members) {
    await db.exec(
      "UPDATE sugo_roadmap_nodes SET parent = ? WHERE user_id = ? AND workspace_name = ? AND id = ?",
      [groupId, userId, workspaceName, memberId]
    );
  }
  if (sequential) {
    for (let i = 1; i < members.length; i++) {
      await linkRoadmapNodes(db, userId, workspaceName, members[i], members[i - 1]);
    }
  }
  return { ok: true };
}

export async function deleteRoadmapGroup(
  db: DbClient,
  userId: string,
  workspaceName: string,
  groupId: string
): Promise<void> {
  await db.exec(
    "UPDATE sugo_roadmap_nodes SET parent = NULL WHERE user_id = ? AND workspace_name = ? AND parent = ?",
    [userId, workspaceName, groupId]
  );
  await db.exec("DELETE FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    userId,
    workspaceName,
    groupId,
  ]);
}

export async function setRoadmapParent(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodeId: string,
  parentId: string | null
): Promise<void> {
  await db.exec("UPDATE sugo_roadmap_nodes SET parent = ? WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    parentId,
    userId,
    workspaceName,
    nodeId,
  ]);
}

export async function renameRoadmapNode(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodeId: string,
  title: string
): Promise<void> {
  await db.exec("UPDATE sugo_roadmap_nodes SET title = ? WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    title,
    userId,
    workspaceName,
    nodeId,
  ]);
}

// manual_status/manual_by/manual_at는 대시보드 소유 - sync가 절대 안 건드리는 컬럼(§7).
export async function setManualStatus(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodeId: string,
  status: string,
  manualBy: string
): Promise<void> {
  await db.exec(
    "UPDATE sugo_roadmap_nodes SET manual_status = ?, manual_by = ?, manual_at = CURRENT_TIMESTAMP WHERE user_id = ? AND workspace_name = ? AND id = ?",
    [status, manualBy, userId, workspaceName, nodeId]
  );
}

export async function clearManualStatus(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodeId: string
): Promise<void> {
  await db.exec(
    "UPDATE sugo_roadmap_nodes SET manual_status = NULL, manual_by = NULL, manual_at = NULL WHERE user_id = ? AND workspace_name = ? AND id = ?",
    [userId, workspaceName, nodeId]
  );
}

export async function setRoadmapPosition(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodeId: string,
  x: number,
  y: number
): Promise<void> {
  await db.exec("UPDATE sugo_roadmap_nodes SET pos_x = ?, pos_y = ? WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    x,
    y,
    userId,
    workspaceName,
    nodeId,
  ]);
}

export async function getReadySet(db: DbClient, userId: string, workspaceName: string): Promise<string[]> {
  const nodes = await loadGraphNodes(db, userId, workspaceName);
  return readySet(nodes.map((n) => ({ id: n.id, dependsOn: n.dependsOn, status: n.status })));
}

export async function getTopoOrder(db: DbClient, userId: string, workspaceName: string) {
  const nodes = await loadGraphNodes(db, userId, workspaceName);
  return topoSort(nodes.map((n) => ({ id: n.id, dependsOn: n.dependsOn, status: n.status })));
}
