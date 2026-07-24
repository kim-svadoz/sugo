import type { DbClient } from "../db/client.js";
import { parseMaybeJson } from "../db/jsonColumn.js";

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
  details: unknown;
}

type ActivityStreamDbRow = Omit<ActivityStreamRow, "details"> & { details: unknown };

// §3.2/§4: polling read, most recent first.
export async function streamActivity(
  db: DbClient,
  userId: string,
  workspace: string | undefined,
  limit: number
): Promise<ActivityStreamRow[]> {
  const rows = workspace
    ? await db.query<ActivityStreamDbRow>(
        "SELECT * FROM sugo_activity_events WHERE user_id = ? AND workspace_name = ? ORDER BY ts DESC LIMIT ?",
        [userId, workspace, limit]
      )
    : await db.query<ActivityStreamDbRow>(
        "SELECT * FROM sugo_activity_events WHERE user_id = ? ORDER BY ts DESC LIMIT ?",
        [userId, limit]
      );
  return rows.map((r) => ({ ...r, details: parseMaybeJson<unknown>(r.details, null) }));
}
