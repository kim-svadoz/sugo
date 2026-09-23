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

/**
 * 설계안 카드/Inspector가 실제로 읽는 필드들. 화면이 요구하는 모양을 그대로 돌려준다 —
 * 프론트에서 카운트를 다시 계산하게 두면 목록 화면 하나 그리려고 워크스페이스마다 N번씩
 * 추가 조회를 하게 된다(도메인 8개면 32번).
 */
export interface WorkspaceSummary {
  name: string;
  projects: WorkspaceProjectRow[];
  taskCounts: TaskCounts;
  roadmap: RoadmapCounts;
  /** 설계안 평평한 별칭 — `ws.roadmapCount` 형태로 직접 참조된다. */
  roadmapCount: number;
  roadmapDoneCount: number;
  activeTaskCount: number;
  historyCount: number;
  decisionCount: number;
  checkpointCount: number;
  projectCount: number;
  /** `Recently Active (30d)` 필터의 기준. 활동이 전혀 없으면 null. */
  lastActivityAt: string | null;
}

// 설계안: roadmap count는 level='task'만, active는 COALESCE(manual_status,status)='in_progress'.
// §7: **dropped는 분모에서 제외**한다 — 폐기는 "안 하기로 한 일"이라 진행률에 남아 있으면
// 아무리 일해도 100%가 안 되는 분모가 된다.
async function roadmapCounts(db: DbClient, userId: string, workspaceName: string): Promise<RoadmapCounts> {
  const rows = await db.query<{ status: string; manual_status: string | null }>(
    "SELECT status, manual_status FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND level = 'task'",
    [userId, workspaceName]
  );
  let total = 0;
  let done = 0;
  let active = 0;
  for (const r of rows) {
    const effective = r.manual_status ?? r.status;
    if (effective === "dropped") continue;
    total++;
    if (effective === "done") done++;
    if (effective === "in_progress") active++;
  }
  return { total, done, active };
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
    const tasks = await taskCounts(db, userId, ws.name);
    const roadmap = await roadmapCounts(db, userId, ws.name);
    const [historyCount, decisionCount, checkpointCount] = await Promise.all([
      countRows(db, "sugo_history", userId, ws.name),
      countRows(db, "sugo_decisions", userId, ws.name),
      countRows(db, "sugo_checkpoints", userId, ws.name),
    ]);
    result.push({
      name: ws.name,
      projects,
      taskCounts: tasks,
      roadmap,
      roadmapCount: roadmap.total,
      roadmapDoneCount: roadmap.done,
      // 설계안 statusOf/activeOf: "진행 중"의 기준은 태스크가 아니라 **캔버스 노드**다
      // (카드가 "N task 진행 중"으로 쓰지만 값은 로드맵 active에서 온다).
      activeTaskCount: roadmap.active,
      historyCount,
      decisionCount,
      checkpointCount,
      projectCount: projects.length,
      lastActivityAt: await lastActivityAt(db, userId, ws.name),
    });
  }
  return result;
}

async function countRows(db: DbClient, table: string, userId: string, workspaceName: string): Promise<number> {
  try {
    const rows = await db.query<{ n: number }>(
      `SELECT COUNT(*) as n FROM ${table} WHERE user_id = ? AND workspace_name = ?`,
      [userId, workspaceName]
    );
    return Number(rows[0]?.n ?? 0);
  } catch {
    // 지연생성 테이블이 아직 없을 수 있다 — 목록 화면 전체를 죽이지 않는다.
    return 0;
  }
}

/** `Recently Active (30d)` 필터 기준. history 최신 완료/생성 시각을 쓴다(활동의 실제 흔적). */
async function lastActivityAt(db: DbClient, userId: string, workspaceName: string): Promise<string | null> {
  try {
    const rows = await db.query<{ ts: string | null }>(
      "SELECT MAX(COALESCE(completed_at, created_at)) as ts FROM sugo_history WHERE user_id = ? AND workspace_name = ?",
      [userId, workspaceName]
    );
    return rows[0]?.ts ?? null;
  } catch {
    return null;
  }
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

export async function getCheckpointSync(db: DbClient, userId: string, workspaceName?: string): Promise<CheckpointSyncRow[]> {
  const rows = await db.query<CheckpointSyncRow>(
    `SELECT id, workspace_name, category, title, learned_from, checklist, applies_to
       FROM sugo_checkpoints
      WHERE user_id = ?${workspaceName ? " AND workspace_name = ?" : ""}
      ORDER BY workspace_name, id`,
    workspaceName ? [userId, workspaceName] : [userId]
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
  id?: string;
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
): Promise<string> {
  if (!input.id) throw new Error("checkpoint id required");
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
  return input.id;
}

export async function getWorkspaceProjectPaths(db: DbClient, userId: string, workspaceName: string): Promise<string[]> {
  const rows = await db.query<{ project_path: string }>(
    `SELECT p.project_path FROM sugo_workspace_projects p
       JOIN sugo_workspaces w ON w.id = p.workspace_id
      WHERE w.user_id = ? AND w.name = ? ORDER BY p.project_path`,
    [userId, workspaceName],
  );
  return rows.map((row) => row.project_path);
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

// ── §7 폐기(discard) — 삭제가 아니라 dropped 재활용 ──────────────────────────

export interface SubtreeResult {
  ok: boolean;
  errorCode?: "NODE_NOT_FOUND" | "SUBTREE_HAS_DONE_TASK";
  message?: string;
  affected: string[];
}

interface SubtreeRow {
  id: string;
  parent: string | null;
  status: string;
  manual_status: string | null;
}

/**
 * rootId에서 parent 링크를 따라 내려가며 BFS로 자손을 모은다. **방문 집합으로 사이클을 흡수한다** —
 * parent는 대시보드에서 사람이 편집할 수 있어 데이터가 항상 트리라는 보장이 없고, 여기서 루프에
 * 빠지면 요청 하나가 프로세스를 잡아먹는다.
 */
function collectSubtree(rows: SubtreeRow[], rootId: string): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const r of rows) {
    if (r.parent === null) continue;
    const list = childrenOf.get(r.parent) ?? [];
    list.push(r.id);
    childrenOf.set(r.parent, list);
  }
  const seen = new Set<string>([rootId]);
  const order: string[] = [rootId];
  const queue = [rootId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const child of childrenOf.get(cur) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      order.push(child);
      queue.push(child);
    }
  }
  return order;
}

async function loadSubtreeRows(db: DbClient, userId: string, workspaceName: string): Promise<SubtreeRow[]> {
  return db.query<SubtreeRow>(
    "SELECT id, parent, status, manual_status FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ?",
    [userId, workspaceName]
  );
}

/**
 * §7 `dropSubtree` — 노드를 **지우지 않고** `manual_status='dropped'`를 root + 전 자손에 cascade한다.
 *
 * DELETE로 만들면 이력이 소실되고 되돌릴 수 없다. 폐기는 "이건 안 한다"는 판단일 뿐이라 복구
 * 가능해야 하고, 진행률 분모에서만 빠지면 된다.
 *
 * **완료된 task가 하위에 있으면 차단한다.** 이미 한 일을 "없던 일"로 만들면 진행률·이력이 거짓이
 * 된다. 부분 적용도 하지 않는다 — 하나라도 걸리면 아무 것도 안 바꾸고 거부한다.
 */
export async function dropSubtree(
  db: DbClient,
  userId: string,
  workspaceName: string,
  rootId: string,
  manualBy: string
): Promise<SubtreeResult> {
  const rows = await loadSubtreeRows(db, userId, workspaceName);
  if (!rows.some((r) => r.id === rootId)) {
    return { ok: false, errorCode: "NODE_NOT_FOUND", message: `노드를 찾을 수 없습니다: ${rootId}`, affected: [] };
  }

  const ids = collectSubtree(rows, rootId);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const doneTask = ids
    .map((id) => byId.get(id)!)
    .find((r) => (r.manual_status ?? r.status) === "done");
  if (doneTask) {
    return {
      ok: false,
      errorCode: "SUBTREE_HAS_DONE_TASK",
      message: `하위에 완료된 항목이 있어 폐기할 수 없습니다: ${doneTask.id}`,
      affected: [],
    };
  }

  for (const id of ids) {
    await db.exec(
      "UPDATE sugo_roadmap_nodes SET manual_status = 'dropped', manual_by = ?, manual_at = CURRENT_TIMESTAMP WHERE user_id = ? AND workspace_name = ? AND id = ?",
      [manualBy, userId, workspaceName, id]
    );
  }
  return { ok: true, affected: ids };
}

/**
 * §7 `restoreSubtree` — **`manual_status='dropped'`인 것만** NULL로 되돌린다.
 * 사람이 손으로 찍은 다른 override(예: `done`)는 폐기와 무관하므로 보존한다 — 복구가 다른
 * 수동 판단까지 지워버리면 그건 복구가 아니라 또 다른 손실이다.
 */
export async function restoreSubtree(
  db: DbClient,
  userId: string,
  workspaceName: string,
  rootId: string
): Promise<SubtreeResult> {
  const rows = await loadSubtreeRows(db, userId, workspaceName);
  if (!rows.some((r) => r.id === rootId)) {
    return { ok: false, errorCode: "NODE_NOT_FOUND", message: `노드를 찾을 수 없습니다: ${rootId}`, affected: [] };
  }

  const byId = new Map(rows.map((r) => [r.id, r]));
  const affected = collectSubtree(rows, rootId).filter((id) => byId.get(id)?.manual_status === "dropped");
  for (const id of affected) {
    await db.exec(
      "UPDATE sugo_roadmap_nodes SET manual_status = NULL, manual_by = NULL, manual_at = NULL WHERE user_id = ? AND workspace_name = ? AND id = ?",
      [userId, workspaceName, id]
    );
  }
  return { ok: true, affected };
}

// ── §7 orphan RUN → Spec 편입/분리 + run- 접두어 ────────────────────────────

export interface AssignRunResult {
  ok: boolean;
  errorCode?: "NODE_NOT_FOUND" | "NOT_A_RUN" | "NOT_A_SPEC" | "SELF_PARENT";
  message?: string;
}

/**
 * §7 `assignRunToSpec` — orphan RUN을 Spec에 편입하거나(`specId`) 분리한다(`null`).
 *
 * **task 잠금과 달리 RUN은 재편입을 허용한다.** task는 소속이 정해지면 이력이 그 밑에 쌓이지만,
 * RUN(feat/patch 실행 단위)은 나중에 "이건 저 Spec 일이었다"고 재분류하는 게 정상 흐름이다.
 * 대신 level은 fail-closed로 검사한다 — 아무 노드나 아무 데나 붙이면 계층이 무의미해진다.
 */
export async function assignRunToSpec(
  db: DbClient,
  userId: string,
  workspaceName: string,
  runId: string,
  specId: string | null
): Promise<AssignRunResult> {
  if (specId !== null && specId === runId) {
    return { ok: false, errorCode: "SELF_PARENT", message: "자기 자신을 부모로 지정할 수 없습니다." };
  }

  const rows = await db.query<{ id: string; level: string }>(
    "SELECT id, level FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id IN (?, ?)",
    [userId, workspaceName, runId, specId ?? runId]
  );
  const byId = new Map(rows.map((r) => [r.id, r]));

  const run = byId.get(runId);
  if (!run) return { ok: false, errorCode: "NODE_NOT_FOUND", message: `노드를 찾을 수 없습니다: ${runId}` };
  if (run.level !== "workstream") {
    return { ok: false, errorCode: "NOT_A_RUN", message: `RUN(workstream)이 아닙니다: ${runId}(level=${run.level})` };
  }

  if (specId !== null) {
    const spec = byId.get(specId);
    if (!spec) return { ok: false, errorCode: "NODE_NOT_FOUND", message: `노드를 찾을 수 없습니다: ${specId}` };
    if (spec.level !== "spec") {
      return { ok: false, errorCode: "NOT_A_SPEC", message: `Spec이 아닙니다: ${specId}(level=${spec.level})` };
    }
  }

  await db.exec("UPDATE sugo_roadmap_nodes SET parent = ? WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    specId,
    userId,
    workspaceName,
    runId,
  ]);
  return { ok: true };
}

/**
 * §7 `nextGroupId` — `run-NNN`(3자리 pad) 생성기. **파서는 `run-` 단일형만 인식한다**(구 `wst-`는
 * 마이그레이션 대상이지 공존 대상이 아니다 — 둘 다 인식하면 번호 공간이 갈라진다).
 * 999를 넘으면 pad 없이 이어간다(자릿수를 잘라 충돌시키지 않는다).
 */
export async function nextGroupId(db: DbClient, userId: string, workspaceName: string): Promise<string> {
  const rows = await db.query<{ id: string }>(
    "SELECT id FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND level = 'workstream'",
    [userId, workspaceName]
  );
  let max = 0;
  for (const r of rows) {
    const m = /^run-(\d+)$/.exec(r.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `run-${String(max + 1).padStart(3, "0")}`;
}

/**
 * §7 `wst-` → `run-` in-place 마이그레이션. **참조 3곳(id·parent·depends_on)을 전부** 옮긴다 —
 * 하나라도 빠지면 dangling 참조가 되어 그래프가 조용히 끊긴다(화면엔 "연결 없음"으로만 보인다).
 * 두 접두어가 같은 길이(4자)라 depends_on JSON은 문자열 치환으로도 유효성이 유지된다.
 *
 * 부팅 시 1회. 절대 던지지 않는다 — 마이그레이션 실패가 대시보드 기동을 막으면 안 된다.
 */
export async function migrateWstToRun(db: DbClient): Promise<{ migrated: number }> {
  try {
    const affected = await db.query<{ user_id: string; workspace_name: string; id: string; parent: string | null; depends_on: unknown }>(
      "SELECT user_id, workspace_name, id, parent, depends_on FROM sugo_roadmap_nodes WHERE id LIKE 'wst-%' OR parent LIKE 'wst-%' OR CAST(depends_on AS CHAR) LIKE '%wst-%'"
    );
    if (affected.length === 0) return { migrated: 0 };

    // **문자열 조작은 애플리케이션에서 한다.** SQL로 하면 MySQL(`CONCAT`/`SUBSTRING`)과
    // SQLite(`||`/`SUBSTR`) 문법이 갈라져 한쪽에서만 도는 마이그레이션이 된다 — 이 프로젝트에서
    // 이미 두 번 물린 함정이라 드라이버 중립으로 짠다.
    const rename = (v: string) => (v.startsWith("wst-") ? `run-${v.slice(4)}` : v);
    let migrated = 0;

    for (const row of affected) {
      // NULL은 NULL로 둔다. `[]`로 바꿔버리면 "순서를 아직 시딩 안 했다"(NULL)와 "비어 있도록
      // 편집했다"(`[]`)의 구분이 사라진다 — 실제 MySQL 검증에서 이 변질을 잡았다.
      const newDeps =
        row.depends_on === null || row.depends_on === undefined
          ? null
          : JSON.stringify(parseJsonArray(row.depends_on).map(rename));
      const newParent = row.parent === null ? null : rename(row.parent);
      const newId = rename(row.id);

      await db.exec(
        "UPDATE sugo_roadmap_nodes SET id = ?, parent = ?, depends_on = ? WHERE user_id = ? AND workspace_name = ? AND id = ?",
        [newId, newParent, newDeps, row.user_id, row.workspace_name, row.id]
      );
      if (newId !== row.id) migrated++;
    }
    return { migrated };
  } catch {
    return { migrated: 0 };
  }
}
