import { randomUUID } from "node:crypto";
import type { DbClient } from "../db/client.js";

export type CommitmentState = "planned" | "active" | "completed" | "cancelled";
export type CommitmentTarget = "implementation" | "review" | "dev" | "stg" | "prd" | "custom";

export interface ScheduleCommitment {
  id: string;
  workspace_name: string;
  spec_id: string;
  title: string;
  due_date: string | null;
  state: CommitmentState;
  target: CommitmentTarget;
  linked_run_id: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

interface CommitmentInput {
  workspaceName: string;
  specId: string;
  title: string;
  dueDate: string | null;
  state?: CommitmentState;
  target: CommitmentTarget;
  linkedRunId?: string | null;
}

interface CommitmentUpdate {
  title: string;
  dueDate: string | null;
  state: CommitmentState;
  target: CommitmentTarget;
  linkedRunId: string | null;
}

const columns = `id, workspace_name, spec_id, title, due_date, state, target, linked_run_id,
  completed_at, completed_by, created_at, updated_at`;

async function getCommitment(db: DbClient, userId: string, id: string): Promise<ScheduleCommitment | null> {
  const [row] = await db.query<ScheduleCommitment>(
    `SELECT ${columns} FROM sugo_schedule_commitments WHERE user_id = ? AND id = ?`,
    [userId, id],
  );
  return row ?? null;
}

async function specExists(db: DbClient, userId: string, workspaceName: string, specId: string): Promise<boolean> {
  const [row] = await db.query<{ present: number }>(
    `SELECT 1 AS present
       FROM sugo_roadmap_nodes n
       JOIN sugo_workspaces w ON w.user_id = n.user_id AND w.name = n.workspace_name
      WHERE n.user_id = ? AND n.workspace_name = ? AND n.id = ? AND n.level = 'spec'
        AND w.deleted_at IS NULL
      LIMIT 1`,
    [userId, workspaceName, specId],
  );
  return Boolean(row);
}

export async function listScheduleCommitments(db: DbClient, userId: string): Promise<ScheduleCommitment[]> {
  return db.query<ScheduleCommitment>(
    `SELECT ${columns} FROM sugo_schedule_commitments
      WHERE user_id = ?
      ORDER BY (due_date IS NULL), due_date, created_at, id`,
    [userId],
  );
}

export async function createScheduleCommitment(
  db: DbClient,
  userId: string,
  input: CommitmentInput,
): Promise<ScheduleCommitment | null> {
  if (!await specExists(db, userId, input.workspaceName, input.specId)) return null;
  const id = randomUUID();
  const now = new Date().toISOString();
  const state = input.state ?? "planned";
  const completed = state === "completed";
  await db.exec(
    `INSERT INTO sugo_schedule_commitments
      (id, user_id, workspace_name, spec_id, title, due_date, state, target, linked_run_id,
       completed_at, completed_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, input.workspaceName, input.specId, input.title, input.dueDate, state, input.target,
      input.linkedRunId ?? null, completed ? now : null, completed ? userId : null, now, now],
  );
  return getCommitment(db, userId, id);
}

export async function updateScheduleCommitment(
  db: DbClient,
  userId: string,
  id: string,
  input: CommitmentUpdate,
): Promise<ScheduleCommitment | null> {
  const existing = await getCommitment(db, userId, id);
  if (!existing) return null;
  const now = new Date().toISOString();
  const completedAt = input.state === "completed" ? (existing.completed_at ?? now) : null;
  const completedBy = input.state === "completed" ? (existing.completed_by ?? userId) : null;
  await db.exec(
    `UPDATE sugo_schedule_commitments
        SET title = ?, due_date = ?, state = ?, target = ?, linked_run_id = ?,
            completed_at = ?, completed_by = ?, updated_at = ?
      WHERE user_id = ? AND id = ?`,
    [input.title, input.dueDate, input.state, input.target, input.linkedRunId,
      completedAt, completedBy, now, userId, id],
  );
  return getCommitment(db, userId, id);
}

export async function completeScheduleCommitment(
  db: DbClient,
  userId: string,
  id: string,
): Promise<ScheduleCommitment | null> {
  const existing = await getCommitment(db, userId, id);
  if (!existing) return null;
  const now = new Date().toISOString();
  await db.exec(
    "UPDATE sugo_schedule_commitments SET state = 'completed', completed_at = ?, completed_by = ?, updated_at = ? WHERE user_id = ? AND id = ?",
    [existing.completed_at ?? now, existing.completed_by ?? userId, now, userId, id],
  );
  return getCommitment(db, userId, id);
}

export async function reopenScheduleCommitment(
  db: DbClient,
  userId: string,
  id: string,
): Promise<ScheduleCommitment | null> {
  const existing = await getCommitment(db, userId, id);
  if (!existing) return null;
  const now = new Date().toISOString();
  await db.exec(
    "UPDATE sugo_schedule_commitments SET state = 'active', completed_at = NULL, completed_by = NULL, updated_at = ? WHERE user_id = ? AND id = ?",
    [now, userId, id],
  );
  return getCommitment(db, userId, id);
}

export async function deleteScheduleCommitment(db: DbClient, userId: string, id: string): Promise<boolean> {
  const result = await db.exec("DELETE FROM sugo_schedule_commitments WHERE user_id = ? AND id = ?", [userId, id]);
  return result.affectedRows > 0;
}
