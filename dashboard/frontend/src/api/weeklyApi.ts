import { apiJson } from "./client.js";

export interface WeeklyReportSummary {
  weekId: string;
  start: string;
  end: string;
  generatedAt: string;
  headline: string[];
  counts?: { topics: number; learnings: number; blocked: number; nextWeek: number };
}

export interface WeeklyReportDetail {
  weekId: string;
  start: string;
  end: string;
  generatedAt: string;
  report: Record<string, unknown>;
}

export type WeeklyModel = "default" | "sonnet" | "opus";
export interface WeeklySettings {
  enabled: boolean;
  weekday: number;
  hour: number;
  minute: number;
  model: WeeklyModel;
  extraRepositories: string[];
  configured: boolean;
  tokenConfigured: boolean;
  engineAvailable: boolean;
}

export interface WeeklySettingsInput {
  enabled: boolean;
  weekday: number;
  hour: number;
  minute: number;
  model: WeeklyModel;
  extraRepositories: string[];
  token?: string;
}

export async function listWeeklyReports(): Promise<WeeklyReportSummary[]> {
  const res = await apiJson<{ reports: WeeklyReportSummary[] }>("/api/weekly/reports");
  return res.reports;
}

export function getWeeklyReport(weekId: string): Promise<WeeklyReportDetail> {
  return apiJson<WeeklyReportDetail>(`/api/weekly/reports/${encodeURIComponent(weekId)}`);
}

export function getWeeklySettings(): Promise<WeeklySettings> {
  return apiJson<WeeklySettings>("/api/weekly/reports/settings/current");
}

export function saveWeeklySettings(settings: WeeklySettingsInput): Promise<WeeklySettings> {
  return apiJson<WeeklySettings>("/api/weekly/reports/settings/current", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
}

export function deleteWeeklyToken(): Promise<{ ok: true }> {
  return apiJson<{ ok: true }>("/api/weekly/reports/settings/token", { method: "DELETE" });
}
