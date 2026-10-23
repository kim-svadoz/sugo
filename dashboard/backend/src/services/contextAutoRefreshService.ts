import type { DbClient } from "../db/client.js";
import type { AwsContextClient } from "../aws/contextClient.js";
import type { PinpointClient } from "../pinpoint/client.js";
import { refreshAllAwsContexts } from "./awsContextService.js";
import { refreshPinpointContext } from "./pinpointContextService.js";

export function localRefreshDay(now = new Date(), timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone): string | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  if (Number(values.hour) < 8) return null;
  return `${values.year}-${values.month}-${values.day}`;
}

type Refresh = (userId: string) => Promise<unknown>;

export async function runDueContextRefresh(db: DbClient, now: Date, refreshAws: Refresh, refreshPinpoint: Refresh, timeZone?: string): Promise<void> {
  const day = localRefreshDay(now, timeZone);
  if (!day) return;
  const users = await db.query<{ user_id: string; has_aws: number; has_pinpoint: number }>(`SELECT user_id, MAX(has_aws) AS has_aws, MAX(has_pinpoint) AS has_pinpoint FROM (
    SELECT user_id, 1 AS has_aws, 0 AS has_pinpoint FROM user_aws_context_accounts
    UNION ALL SELECT user_id, 0 AS has_aws, 1 AS has_pinpoint FROM user_pinpoint_context
  ) connected GROUP BY user_id`);
  for (const { user_id: userId, has_aws: hasAws, has_pinpoint: hasPinpoint } of users) {
    const prior = await db.query<{ status: string }>("SELECT status FROM user_context_auto_refresh_runs WHERE user_id = ? AND day_key = ?", [userId, day]);
    if (prior[0]?.status === "completed") continue;
    await db.exec("DELETE FROM user_context_auto_refresh_runs WHERE user_id = ? AND day_key = ?", [userId, day]);
    await db.exec("INSERT INTO user_context_auto_refresh_runs (user_id, day_key, status, started_at, completed_at, error_message) VALUES (?, ?, ?, ?, ?, ?)", [userId, day, "running", now.toISOString(), null, null]);
    try {
      // Pinpoint 대상은 AWS ECS 스냅샷에서 찾으므로 이 순서를 유지한다.
      if (Number(hasAws)) await refreshAws(userId);
      if (Number(hasPinpoint)) await refreshPinpoint(userId);
      await db.exec("UPDATE user_context_auto_refresh_runs SET status = ?, completed_at = ?, error_message = ? WHERE user_id = ? AND day_key = ?", ["completed", new Date().toISOString(), null, userId, day]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.exec("UPDATE user_context_auto_refresh_runs SET status = ?, completed_at = ?, error_message = ? WHERE user_id = ? AND day_key = ?", ["failed", new Date().toISOString(), message.slice(0, 1000), userId, day]);
    }
  }
}

export function startContextAutoRefresh(db: DbClient, aws: AwsContextClient, pinpoint: PinpointClient): () => void {
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  const run = () => runDueContextRefresh(db, new Date(), (userId) => refreshAllAwsContexts(db, userId, aws), (userId) => refreshPinpointContext(db, userId, pinpoint))
    .catch((error) => console.error("[dashboard] context auto refresh failed:", error instanceof Error ? error.message : error));
  const schedule = () => {
    if (stopped) return;
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setMinutes(60, 0, 0);
    timer = setTimeout(async () => { await run(); schedule(); }, nextHour.getTime() - now.getTime());
    timer.unref?.();
  };
  void run();
  schedule();
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
