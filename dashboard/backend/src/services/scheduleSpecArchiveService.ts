import type { DbClient } from "../db/client.js";

export type ScheduleSpecArchiveReason = "deleted" | "closed";

export interface ScheduleSpecArchive {
  workspace_name: string;
  spec_id: string;
  title: string;
  reason: ScheduleSpecArchiveReason;
  archived_at: string;
  last_worked_at: string;
  archived_by: string;
}

export interface ScheduleSpecArchivePage {
  items: ScheduleSpecArchive[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

interface NodeRow { id: string; parent: string | null; level: string; title: string; manual_title: string | null; updated_at: string }

export async function ensureScheduleSpecArchiveLastWorkedAtColumn(db: DbClient): Promise<void> {
  try { await db.query("SELECT last_worked_at FROM sugo_schedule_spec_archives LIMIT 1"); return; } catch { /* upgrade schema */ }
  await db.exec("ALTER TABLE sugo_schedule_spec_archives ADD COLUMN last_worked_at TIMESTAMP NULL DEFAULT NULL");
}

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
    "SELECT id, parent, level, title, manual_title, updated_at FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ?",
    [userId, workspaceName],
  );
  const root = rows.find(row => row.id === specId && row.level === "spec");
  if (!root) return null;
  const now = new Date().toISOString();
  const title = root.manual_title ?? root.title;
  const ids = new Set(subtree(rows, specId));
  const lastWorkedAt = rows
    .filter(row => ids.has(row.id))
    .map(row => row.updated_at)
    .filter(Boolean)
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? now;
  await db.exec("DELETE FROM sugo_schedule_spec_archives WHERE user_id = ? AND workspace_name = ? AND spec_id = ?", [userId, workspaceName, specId]);
  await db.exec(
    `INSERT INTO sugo_schedule_spec_archives
      (user_id, workspace_name, spec_id, reason, title, archived_at, last_worked_at, archived_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, workspaceName, specId, reason, title, now, lastWorkedAt, userId],
  );
  // 삭제는 폐기이므로 Canvas 폐기함에 남긴다. 정상 종료는 보관이며 dropped가 아니다.
  // 종료된 subtree는 getRoadmap이 archive 정본을 기준으로 본문/진행률에서 제외한다.
  if (reason === "deleted") for (const id of subtree(rows, specId)) {
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
  return { workspace_name: workspaceName, spec_id: specId, reason, title, archived_at: now, last_worked_at: lastWorkedAt, archived_by: userId };
}

export async function listScheduleSpecArchives(db: DbClient, userId: string, page = 1, pageSize = 20, workspace?: string, reason?: ScheduleSpecArchiveReason): Promise<ScheduleSpecArchivePage> {
  const clauses = ["user_id = ?"];
  const params: unknown[] = [userId];
  if (workspace) { clauses.push("workspace_name = ?"); params.push(workspace); }
  if (reason) { clauses.push("reason = ?"); params.push(reason); }
  const where = `WHERE ${clauses.join(" AND ")}`;
  const [{ total }] = await db.query<{ total: number }>(`SELECT COUNT(*) AS total FROM sugo_schedule_spec_archives ${where}`, params);
  const offset = (page - 1) * pageSize;
  const items = await db.query<ScheduleSpecArchive>(
    `SELECT workspace_name, spec_id, title, reason, archived_at, COALESCE(last_worked_at, archived_at) AS last_worked_at, archived_by
     FROM sugo_schedule_spec_archives ${where} ORDER BY archived_at DESC LIMIT ? OFFSET ?`,
    [...params, pageSize, offset],
  );
  return { items, total: Number(total), page, pageSize, hasMore: offset + items.length < Number(total) };
}

export async function restoreScheduleSpec(db: DbClient, userId: string, workspaceName: string, specId: string): Promise<boolean> {
  const rows = await db.query<NodeRow>(
    "SELECT id, parent, level, title, manual_title, updated_at FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ?",
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
