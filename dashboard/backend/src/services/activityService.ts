import type { DbClient } from "../db/client.js";
import { parseMaybeJson } from "../db/jsonColumn.js";
import { toDbDateTime } from "../db/datetime.js";

export const ACTIVITY_RETENTION_DAYS = 90;

/**
 * 라이브 콘솔은 운영 이력이 아니라 일시적인 관측 데이터다. 서버가 시작될 때 90일보다 오래된
 * 이벤트만 제거하며, 워크스페이스·TASK·SPEC·체크포인트·History 테이블은 건드리지 않는다.
 * SQLite의 빈 페이지는 이후 쓰기에서 재사용되므로 여기서 VACUUM은 실행하지 않는다.
 */
export async function pruneExpiredActivityEvents(
  db: DbClient,
  now = new Date(),
  retentionDays = ACTIVITY_RETENTION_DAYS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000);
  const cutoffValue = toDbDateTime(cutoff.toISOString());
  if (!cutoffValue) return 0;
  const result = await db.exec("DELETE FROM sugo_activity_events WHERE ts < ?", [cutoffValue]);
  return result.affectedRows;
}

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
      toDbDateTime(input.ts) ?? toDbDateTime(new Date().toISOString()),
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
