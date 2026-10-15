import type { DbClient } from "../db/client.js";

export type ScheduleSpecArchiveReason = "deleted" | "closed";

export interface ScheduleSpecArchive {
  workspace_name: string;
  spec_id: string;
  title: string;
  reason: ScheduleSpecArchiveReason;
  archived_at: string;
  archived_by: string;
}

interface NodeRow { id: string; parent: string | null; level: string; title: string; manual_title: string | null }

function subtree(rows: NodeRow[], rootId: string): string[] {
  const found = new Set([rootId]);
  for (let changed = true; changed;) {
    changed = false;
    for (const row of rows) if (row.parent && found.has(row.parent) && !found.has(row.id)) {
      found.add(row.id);
      changed = true;
    }
  }
  return [...found];
}

export async function archiveScheduleSpec(
  db: DbClient, userId: string, workspaceName: string, specId: string, reason: ScheduleSpecArchiveReason,
): Promise<ScheduleSpecArchive | null> {
  const rows = await db.query<NodeRow>(
    "SELECT id, parent, level, title, manual_title FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ?",
    [userId, workspaceName],
  );
  const root = rows.find(row => row.id === specId && row.level === "spec");
  if (!root) return null;
  const now = new Date().toISOString();
  const title = root.manual_title ?? root.title;
  await db.exec("DELETE FROM sugo_schedule_spec_archives WHERE user_id = ? AND workspace_name = ? AND spec_id = ?", [userId, workspaceName, specId]);
  await db.exec(
    `INSERT INTO sugo_schedule_spec_archives
      (user_id, workspace_name, spec_id, reason, title, archived_at, archived_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, workspaceName, specId, reason, title, now, userId],
  );
  for (const id of subtree(rows, specId)) {
    await db.exec(
      "UPDATE sugo_roadmap_nodes SET manual_status = 'dropped', manual_by = ?, manual_at = ? WHERE user_id = ? AND workspace_name = ? AND id = ?",
      [userId, now, userId, workspaceName, id],
    );
  }
  if (reason === "closed") {
    await db.exec(
      "UPDATE sugo_schedule_commitments SET state = 'completed', completed_at = COALESCE(completed_at, ?), completed_by = COALESCE(completed_by, ?), updated_at = ? WHERE user_id = ? AND workspace_name = ? AND spec_id = ? AND state <> 'completed'",
      [now, userId, now, userId, workspaceName, specId],
    );
  }
  return { workspace_name: workspaceName, spec_id: specId, reason, title, archived_at: now, archived_by: userId };
}

export async function listScheduleSpecArchives(db: DbClient, userId: string): Promise<ScheduleSpecArchive[]> {
  return db.query<ScheduleSpecArchive>(
    "SELECT workspace_name, spec_id, title, reason, archived_at, archived_by FROM sugo_schedule_spec_archives WHERE user_id = ? ORDER BY archived_at DESC",
    [userId],
  );
}

export async function restoreScheduleSpec(db: DbClient, userId: string, workspaceName: string, specId: string): Promise<boolean> {
  const rows = await db.query<NodeRow>(
    "SELECT id, parent, level, title, manual_title FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ?",
    [userId, workspaceName],
  );
  if (!rows.some(row => row.id === specId && row.level === "spec")) return false;
  for (const id of subtree(rows, specId)) {
    await db.exec(
      "UPDATE sugo_roadmap_nodes SET manual_status = NULL, manual_by = NULL, manual_at = NULL WHERE user_id = ? AND workspace_name = ? AND id = ? AND manual_status = 'dropped'",
      [userId, workspaceName, id],
    );
  }
  const result = await db.exec("DELETE FROM sugo_schedule_spec_archives WHERE user_id = ? AND workspace_name = ? AND spec_id = ?", [userId, workspaceName, specId]);
  return result.affectedRows > 0;
}
