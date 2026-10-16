import type { DbClient } from "../db/client.js";
import { upsertRow } from "../db/upsert.js";

export interface WeeklyReportInput {
  weekId: string;
  start: string;
  end: string;
  generatedAt: string;
  report: Record<string, unknown>;
}

export interface WeeklyReportSummary {
  weekId: string;
  start: string;
  end: string;
  generatedAt: string;
  headline: string[];
}

export interface WeeklyReport {
  weekId: string;
  start: string;
  end: string;
  generatedAt: string;
  report: Record<string, unknown>;
}

interface Row {
  week_id: string;
  start_date: string;
  end_date: string;
  generated_at: string;
  report_json: string;
}

function headlineOf(report: Record<string, unknown>): string[] {
  const headline = report.headline;
  return Array.isArray(headline) ? headline.filter((line): line is string => typeof line === "string") : [];
}

/** 같은 주를 다시 보내면 덮어쓴다 — weekly는 같은 주 보고서를 다시 만들 수 있다. */
export async function saveWeeklyReport(db: DbClient, userId: string, input: WeeklyReportInput): Promise<void> {
  await upsertRow(
    db,
    "sugo_weekly_reports",
    { user_id: userId, week_id: input.weekId },
    {
      start_date: input.start,
      end_date: input.end,
      generated_at: input.generatedAt,
      uploaded_at: new Date().toISOString(),
      report_json: JSON.stringify(input.report),
    },
  );
}

export async function listWeeklyReports(db: DbClient, userId: string): Promise<WeeklyReportSummary[]> {
  const rows = await db.query<Row>(
    "SELECT week_id, start_date, end_date, generated_at, report_json FROM sugo_weekly_reports WHERE user_id = ? ORDER BY week_id DESC",
    [userId],
  );
  return rows.map((row) => ({
    weekId: row.week_id,
    start: row.start_date,
    end: row.end_date,
    generatedAt: row.generated_at,
    headline: headlineOf(JSON.parse(row.report_json)),
  }));
}

export async function getWeeklyReport(db: DbClient, userId: string, weekId: string): Promise<WeeklyReport | null> {
  const rows = await db.query<Row>(
    "SELECT week_id, start_date, end_date, generated_at, report_json FROM sugo_weekly_reports WHERE user_id = ? AND week_id = ?",
    [userId, weekId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    weekId: row.week_id,
    start: row.start_date,
    end: row.end_date,
    generatedAt: row.generated_at,
    report: JSON.parse(row.report_json),
  };
}
