import { apiJson, withUserId } from "./client.js";

export interface RecentHistoryRow {
  id: string;
  workspace_name: string;
  task_id: string | null;
  task_title: string | null;
  summary: string | null;
  completed_at: string | null;
  created_at: string;
}

export async function getRecentHistory(userId: string, limit: number): Promise<RecentHistoryRow[]> {
  const res = await apiJson<{ history: RecentHistoryRow[] }>(
    withUserId("/api/workspaces/recent-history", userId, { limit: String(limit) })
  );
  return res.history;
}
