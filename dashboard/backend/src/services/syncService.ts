import type { DbClient } from "../db/client.js";
import { upsertRow } from "../db/upsert.js";
import { cleanDanglingDeps, computeNodesToDelete, shouldSeedDependsOn } from "./roadmapDiff.js";
import { parseJsonArray } from "../db/jsonColumn.js";
import { toDbDateTime } from "../db/datetime.js";

export async function ensureUser(db: DbClient, userId: string): Promise<void> {
  await upsertRow(db, "sugo_users", { id: userId }, {});
}

export interface SyncUserInput {
  userId: string;
  displayName?: string;
}

export async function syncUser(db: DbClient, input: SyncUserInput): Promise<void> {
  await upsertRow(
    db,
    "sugo_users",
    { id: input.userId },
    input.displayName !== undefined ? { display_name: input.displayName } : {}
  );
}

export interface SyncWorkspaceInput {
  userId: string;
  name: string;
  projects?: string[];
  gitSyncedProjects?: string[];
}

async function getOrCreateWorkspaceId(db: DbClient, userId: string, name: string): Promise<number> {
  const rows = await db.query<{ id: number }>(
    "SELECT id FROM sugo_workspaces WHERE user_id = ? AND name = ?",
    [userId, name]
  );
  if (rows.length > 0) return rows[0].id;
  const result = await db.exec("INSERT INTO sugo_workspaces (user_id, name) VALUES (?, ?)", [userId, name]);
  return Number(result.insertId);
}

// §3.1 "workspace: projects replace + gitSyncedProjects"
export async function syncWorkspace(db: DbClient, input: SyncWorkspaceInput): Promise<void> {
  await ensureUser(db, input.userId);
  const workspaceId = await getOrCreateWorkspaceId(db, input.userId, input.name);

  const projects = input.projects ?? [];
  const gitSynced = new Set(input.gitSyncedProjects ?? []);

  const existing = await db.query<{ id: number; project_path: string }>(
    "SELECT id, project_path FROM sugo_workspace_projects WHERE workspace_id = ?",
    [workspaceId]
  );
  const existingByPath = new Map(existing.map((p) => [p.project_path, p.id]));
  const incoming = new Set(projects);

  for (const p of existing) {
    if (!incoming.has(p.project_path)) {
      await db.exec("DELETE FROM sugo_workspace_projects WHERE id = ?", [p.id]);
    }
  }

  for (const path of projects) {
    const flag = gitSynced.has(path) ? 1 : 0;
    const existingId = existingByPath.get(path);
    if (existingId !== undefined) {
      await db.exec("UPDATE sugo_workspace_projects SET git_synced = ? WHERE id = ?", [flag, existingId]);
    } else {
      await db.exec(
        "INSERT INTO sugo_workspace_projects (workspace_id, project_path, git_synced) VALUES (?, ?, ?)",
        [workspaceId, path, flag]
      );
    }
  }
}

export async function deleteWorkspace(db: DbClient, userId: string, name: string): Promise<void> {
  await db.exec("DELETE FROM sugo_workspaces WHERE user_id = ? AND name = ?", [userId, name]);
}

export interface SyncTaskInput {
  userId: string;
  workspaceName: string;
  id: string;
  title: string;
  project?: string | null;
  status?: string;
  priority?: string | null;
  description?: string | null;
  summary?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export async function syncTask(db: DbClient, input: SyncTaskInput): Promise<void> {
  await ensureUser(db, input.userId);
  await upsertRow(
    db,
    "sugo_tasks",
    { user_id: input.userId, workspace_name: input.workspaceName, id: input.id },
    {
      title: input.title,
      project: input.project ?? null,
      status: input.status ?? "pending",
      priority: input.priority ?? null,
      description: input.description ?? null,
      summary: input.summary ?? null,
      started_at: toDbDateTime(input.startedAt),
      completed_at: toDbDateTime(input.completedAt),
    }
  );
}

export async function deleteTask(db: DbClient, userId: string, workspaceName: string, id: string): Promise<void> {
  await db.exec("DELETE FROM sugo_tasks WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    userId,
    workspaceName,
    id,
  ]);
}

export interface SyncHistoryInput {
  userId: string;
  workspaceName: string;
  id: string;
  taskId?: string | null;
  taskTitle?: string | null;
  summary?: string | null;
  keyDecisions?: unknown;
  filesChanged?: unknown;
  notes?: string | null;
  completedAt?: string | null;
  estimatedHumanHours?: number | null;
  userReportedHumanHours?: number | null;
  aiExecutionMinutes?: number | null;
  estimationBasis?: string | null;
}

export async function syncHistory(db: DbClient, input: SyncHistoryInput): Promise<void> {
  await ensureUser(db, input.userId);
  await upsertRow(
    db,
    "sugo_history",
    { user_id: input.userId, workspace_name: input.workspaceName, id: input.id },
    {
      task_id: input.taskId ?? null,
      task_title: input.taskTitle ?? null,
      summary: input.summary ?? null,
      key_decisions: input.keyDecisions !== undefined ? JSON.stringify(input.keyDecisions) : null,
      files_changed: input.filesChanged !== undefined ? JSON.stringify(input.filesChanged) : null,
      notes: input.notes ?? null,
      completed_at: toDbDateTime(input.completedAt),
      estimated_human_hours: input.estimatedHumanHours ?? null,
      user_reported_human_hours: input.userReportedHumanHours ?? null,
      ai_execution_minutes: input.aiExecutionMinutes ?? null,
      estimation_basis: input.estimationBasis ?? null,
    }
  );
}

export async function deleteHistory(db: DbClient, userId: string, workspaceName: string, id: string): Promise<void> {
  await db.exec("DELETE FROM sugo_history WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    userId,
    workspaceName,
    id,
  ]);
}

export interface SyncDecisionInput {
  userId: string;
  workspaceName: string;
  id: string;
  title: string;
  status?: string;
  content?: string | null;
  decisionDate?: string | null;
}

export async function syncDecision(db: DbClient, input: SyncDecisionInput): Promise<void> {
  await ensureUser(db, input.userId);
  await upsertRow(
    db,
    "sugo_decisions",
    { user_id: input.userId, workspace_name: input.workspaceName, id: input.id },
    {
      title: input.title,
      status: input.status ?? "accepted",
      content: input.content ?? null,
      decision_date: toDbDateTime(input.decisionDate),
    }
  );
}

export async function deleteDecision(db: DbClient, userId: string, workspaceName: string, id: string): Promise<void> {
  await db.exec("DELETE FROM sugo_decisions WHERE user_id = ? AND workspace_name = ? AND id = ?", [
    userId,
    workspaceName,
    id,
  ]);
}

export interface SyncCheckpointInput {
  userId: string;
  workspaceName: string;
  id: string;
  category?: string;
  title: string;
  learnedFrom?: string | null;
  checklist?: unknown;
  appliesTo?: unknown;
  checkpointDate?: string | null;
}

export async function syncCheckpoint(db: DbClient, input: SyncCheckpointInput): Promise<void> {
  await ensureUser(db, input.userId);
  await upsertRow(
    db,
    "sugo_checkpoints",
    { user_id: input.userId, workspace_name: input.workspaceName, id: input.id },
    {
      category: input.category ?? "general",
      title: input.title,
      learned_from: input.learnedFrom ?? null,
      checklist: input.checklist !== undefined ? JSON.stringify(input.checklist) : null,
      applies_to: input.appliesTo !== undefined ? JSON.stringify(input.appliesTo) : null,
      checkpoint_date: toDbDateTime(input.checkpointDate),
    }
  );
}

export async function deleteCheckpoint(
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

export interface SyncWorkspaceMetaInput {
  userId: string;
  workspaceName: string;
  goldenRule?: string | null;
  checkpointsVersion?: number;
}

export async function syncWorkspaceMeta(db: DbClient, input: SyncWorkspaceMetaInput): Promise<void> {
  await ensureUser(db, input.userId);
  await upsertRow(
    db,
    "sugo_workspace_meta",
    { user_id: input.userId, workspace_name: input.workspaceName },
    {
      golden_rule: input.goldenRule ?? null,
      checkpoints_version: input.checkpointsVersion ?? 0,
    }
  );
}

export async function syncPluginVersion(db: DbClient, userId: string, version: string): Promise<void> {
  await ensureUser(db, userId);
  await db.exec(
    "UPDATE sugo_users SET plugin_version = ?, version_updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    [version, userId]
  );
}

export async function getPluginVersion(db: DbClient, userId: string): Promise<string | null> {
  const rows = await db.query<{ plugin_version: string | null }>(
    "SELECT plugin_version FROM sugo_users WHERE id = ?",
    [userId]
  );
  return rows[0]?.plugin_version ?? null;
}

export interface RoadmapNodeInput {
  id: string;
  title: string;
  level: string;
  status: string;
  dependsOn?: string[];
  parent?: string | null;
  ref?: string | null;
  note?: string | null;
  specPath?: string | null;
  workResult?: unknown;
  lineage?: unknown;
}

interface RoadmapRow {
  id: string;
  level: string;
  // driver-dependent: mysql2 auto-parses JSON columns to arrays, node:sqlite
  // returns the raw TEXT string - parseJsonArray() normalizes both.
  depends_on: unknown;
}

// §3.1/§7 roadmap sync: 스냅샷 replace 시맨틱 + 소유권 경계(depends_on 최초1회 seed,
// manual_status/manual_by/manual_at/pos_x/pos_y는 upsert SET에서 물리적으로 제외).
export async function syncRoadmap(
  db: DbClient,
  userId: string,
  workspaceName: string,
  nodes: RoadmapNodeInput[]
): Promise<void> {
  await ensureUser(db, userId);

  const existingRows = await db.query<RoadmapRow>(
    "SELECT id, level, depends_on FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ?",
    [userId, workspaceName]
  );
  const existingById = new Map(existingRows.map((r) => [r.id, r]));
  const incomingIds = new Set(nodes.map((n) => n.id));

  const toDelete = computeNodesToDelete(
    existingRows.map((r) => ({ id: r.id, level: r.level, dependsOn: parseJsonArray(r.depends_on) })),
    incomingIds
  );
  for (const id of toDelete) {
    await db.exec("DELETE FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id = ?", [
      userId,
      workspaceName,
      id,
    ]);
  }
  const deletedIds = new Set(toDelete);

  for (const node of nodes) {
    const existing = existingById.get(node.id);
    const existingDeps = existing ? parseJsonArray(existing.depends_on) : undefined;
    const seed = shouldSeedDependsOn(existingDeps);
    const incomingDeps = cleanDanglingDeps(node.dependsOn ?? [], deletedIds);

    const workResultJson = node.workResult !== undefined ? JSON.stringify(node.workResult) : undefined;
    const lineageJson = node.lineage !== undefined ? JSON.stringify(node.lineage) : undefined;

    if (!existing) {
      await db.exec(
        `INSERT INTO sugo_roadmap_nodes
         (id, user_id, workspace_name, title, level, status, depends_on, parent, ref, note, spec_path, work_result, lineage, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          node.id,
          userId,
          workspaceName,
          node.title,
          node.level,
          node.status,
          JSON.stringify(incomingDeps),
          node.parent ?? null,
          node.ref ?? null,
          node.note ?? null,
          node.specPath ?? null,
          workResultJson ?? null,
          lineageJson ?? null,
        ]
      );
      continue;
    }

    const sets = ["title = ?", "level = ?", "status = ?", "parent = ?", "ref = ?", "note = ?", "spec_path = ?", "synced_at = CURRENT_TIMESTAMP"];
    const params: unknown[] = [node.title, node.level, node.status, node.parent ?? null, node.ref ?? null, node.note ?? null, node.specPath ?? null];
    if (workResultJson !== undefined) {
      sets.push("work_result = ?");
      params.push(workResultJson);
    }
    if (lineageJson !== undefined) {
      sets.push("lineage = ?");
      params.push(lineageJson);
    }
    if (seed) {
      sets.push("depends_on = ?");
      params.push(JSON.stringify(incomingDeps));
    }
    params.push(userId, workspaceName, node.id);
    await db.exec(
      `UPDATE sugo_roadmap_nodes SET ${sets.join(", ")} WHERE user_id = ? AND workspace_name = ? AND id = ?`,
      params
    );
  }

  // Sweep every remaining node for dangling refs to a deleted id - not just
  // the ones untouched this round. A node whose depends_on is dashboard-owned
  // (seed=false in the loop above) never had its incoming value applied, so
  // its stored depends_on can still point at an id we just deleted; this is
  // invalid data regardless of ownership, so cleanup runs unconditionally.
  if (deletedIds.size > 0) {
    const remaining = await db.query<RoadmapRow>(
      "SELECT id, level, depends_on FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ?",
      [userId, workspaceName]
    );
    for (const row of remaining) {
      const deps = parseJsonArray(row.depends_on);
      const cleaned = cleanDanglingDeps(deps, deletedIds);
      if (cleaned.length !== deps.length) {
        await db.exec(
          "UPDATE sugo_roadmap_nodes SET depends_on = ? WHERE user_id = ? AND workspace_name = ? AND id = ?",
          [JSON.stringify(cleaned), userId, workspaceName, row.id]
        );
      }
    }
  }
}
