import { apiJson } from "./client.js";

export interface WeeklyReportSummary {
  weekId: string;
  start: string;
  end: string;
  generatedAt: string;
  headline: string[];
}

export interface WeeklyReportDetail {
  weekId: string;
  start: string;
  end: string;
  generatedAt: string;
  report: Record<string, unknown>;
}

export async function listWeeklyReports(): Promise<WeeklyReportSummary[]> {
  const res = await apiJson<{ reports: WeeklyReportSummary[] }>("/api/weekly/reports");
  return res.reports;
}

export function getWeeklyReport(weekId: string): Promise<WeeklyReportDetail> {
  return apiJson<WeeklyReportDetail>(`/api/weekly/reports/${encodeURIComponent(weekId)}`);
}
