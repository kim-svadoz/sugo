import { randomBytes } from "node:crypto";
import type { DbClient } from "../db/client.js";

export interface ScheduleMemo {
  id: string;
  title: string;
  content_md: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
}

export interface ScheduleMemoPage { items: ScheduleMemo[]; total: number; page: number; pageSize: number; hasMore: boolean }

export async function ensureScheduleMemoArchivedAtColumn(db: DbClient): Promise<void> {
  try { await db.query("SELECT archived_at FROM sugo_schedule_memos LIMIT 1"); return; } catch { /* upgrade schema */ }
  await db.exec("ALTER TABLE sugo_schedule_memos ADD COLUMN archived_at TIMESTAMP NULL DEFAULT NULL");
}

export async function listScheduleMemos(db: DbClient, userId: string): Promise<ScheduleMemo[]> {
  return db.query<ScheduleMemo>(
    "SELECT id, title, content_md, due_date, created_at, updated_at FROM sugo_schedule_memos WHERE user_id = ? AND archived_at IS NULL ORDER BY (due_date IS NULL), due_date, created_at",
    [userId],
  );
}

export async function createScheduleMemo(
  db: DbClient,
  userId: string,
  input: { title: string; contentMd: string; dueDate: string | null },
): Promise<ScheduleMemo> {
  const id = `memo-${randomBytes(8).toString("hex")}`;
  await db.exec(
    "INSERT INTO sugo_schedule_memos (id, user_id, title, content_md, due_date) VALUES (?, ?, ?, ?, ?)",
    [id, userId, input.title, input.contentMd, input.dueDate],
  );
  const [created] = await db.query<ScheduleMemo>(
    "SELECT id, title, content_md, due_date, created_at, updated_at FROM sugo_schedule_memos WHERE user_id = ? AND id = ?",
    [userId, id],
  );
  return created;
}

export async function updateScheduleMemo(
  db: DbClient,
  userId: string,
  id: string,
  input: { title: string; contentMd: string; dueDate: string | null },
): Promise<ScheduleMemo | null> {
  const updatedAt = new Date().toISOString();
  const result = await db.exec(
    "UPDATE sugo_schedule_memos SET title = ?, content_md = ?, due_date = ?, updated_at = ? WHERE user_id = ? AND id = ? AND archived_at IS NULL",
    [input.title, input.contentMd, input.dueDate, updatedAt, userId, id],
  );
  if (result.affectedRows === 0) return null;
  const [updated] = await db.query<ScheduleMemo>(
    "SELECT id, title, content_md, due_date, created_at, updated_at FROM sugo_schedule_memos WHERE user_id = ? AND id = ?",
    [userId, id],
  );
  return updated;
}

export async function setScheduleMemoDueDate(
  db: DbClient,
  userId: string,
  id: string,
  dueDate: string | null,
): Promise<boolean> {
  const result = await db.exec(
    "UPDATE sugo_schedule_memos SET due_date = ?, updated_at = ? WHERE user_id = ? AND id = ? AND archived_at IS NULL",
    [dueDate, new Date().toISOString(), userId, id],
  );
  return result.affectedRows > 0;
}

export async function deleteScheduleMemo(db: DbClient, userId: string, id: string): Promise<boolean> {
  const result = await db.exec(
    "UPDATE sugo_schedule_memos SET archived_at = ? WHERE user_id = ? AND id = ? AND archived_at IS NULL",
    [new Date().toISOString(), userId, id],
  );
  return result.affectedRows > 0;
}

export async function listArchivedScheduleMemos(db: DbClient, userId: string, page = 1, pageSize = 20): Promise<ScheduleMemoPage> {
  const [{ total }] = await db.query<{ total: number }>("SELECT COUNT(*) AS total FROM sugo_schedule_memos WHERE user_id = ? AND archived_at IS NOT NULL", [userId]);
  const offset = (page - 1) * pageSize;
  const items = await db.query<ScheduleMemo>(
    `SELECT id, title, content_md, due_date, created_at,
       CASE WHEN updated_at = archived_at THEN created_at ELSE updated_at END AS updated_at, archived_at
     FROM sugo_schedule_memos WHERE user_id = ? AND archived_at IS NOT NULL ORDER BY archived_at DESC LIMIT ? OFFSET ?`,
    [userId, pageSize, offset],
  );
  return { items, total: Number(total), page, pageSize, hasMore: offset + items.length < Number(total) };
}

export async function restoreScheduleMemo(db: DbClient, userId: string, id: string): Promise<boolean> {
  const result = await db.exec(
    "UPDATE sugo_schedule_memos SET archived_at = NULL, updated_at = ? WHERE user_id = ? AND id = ? AND archived_at IS NOT NULL",
    [new Date().toISOString(), userId, id],
  );
  return result.affectedRows > 0;
}
