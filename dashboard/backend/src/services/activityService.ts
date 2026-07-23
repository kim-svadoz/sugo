import type { DbClient } from "../db/client.js";

export interface IngestActivityInput {
  userId: string;
  workspace: string;
  ts?: string;
  level?: string;
  agent?: string | null;
  handoffTo?: string | null;
  eventType?: string;
  message: string;
  details?: unknown;
}

// §3.2/§4: fire-and-forget, non-blocking - a single INSERT, no extra work.
export async function ingestActivity(db: DbClient, input: IngestActivityInput): Promise<void> {
  await db.exec(
    `INSERT INTO sugo_activity_events
     (user_id, workspace_name, ts, level, agent, handoff_to, event_type, message, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId,
      input.workspace,
      input.ts ?? new Date().toISOString(),
      input.level ?? "INFO",
      input.agent ?? null,
      input.handoffTo ?? null,
      input.eventType ?? "SYSTEM",
      input.message,
      input.details !== undefined ? JSON.stringify(input.details) : null,
    ]
  );
}

export interface ActivityStreamRow {
  id: number;
  user_id: string;
  workspace_name: string;
  ts: string;
  level: string;
  agent: string | null;
  handoff_to: string | null;
  event_type: string;
  message: string;
  details: string | null;
}

// §3.2/§4: polling read, most recent first.
export async function streamActivity(
  db: DbClient,
  userId: string,
  workspace: string | undefined,
  limit: number
): Promise<ActivityStreamRow[]> {
  if (workspace) {
    return db.query<ActivityStreamRow>(
      "SELECT * FROM sugo_activity_events WHERE user_id = ? AND workspace_name = ? ORDER BY ts DESC LIMIT ?",
      [userId, workspace, limit]
    );
  }
  return db.query<ActivityStreamRow>(
    "SELECT * FROM sugo_activity_events WHERE user_id = ? ORDER BY ts DESC LIMIT ?",
    [userId, limit]
  );
}
