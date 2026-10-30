import { apiJson, withUserId } from "./client.js";

export type ScheduleSpecArchiveReason = "deleted" | "closed";
export interface ArchivePagination { total: number; page: number; pageSize: number; hasMore: boolean }
export interface ScheduleSpecArchive { workspace_name: string; spec_id: string; title: string; reason: ScheduleSpecArchiveReason; archived_at: string; last_worked_at: string | null; archived_by: string }
export interface ScheduleSpecArchivePage { items: ScheduleSpecArchive[]; pagination: ArchivePagination }
const base = "/api/schedule/specs";
export async function getScheduleSpecArchives(userId: string, page = 1, pageSize = 20, workspace?: string, reason?: ScheduleSpecArchiveReason): Promise<ScheduleSpecArchivePage> {
  const extra: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
  if (workspace) extra.workspace = workspace;
  if (reason) extra.reason = reason;
  const result = await apiJson<{ specs: ScheduleSpecArchive[]; pagination: ArchivePagination }>(withUserId(`${base}/archive`, userId, extra));
  return { items: result.specs, pagination: result.pagination ?? { total: result.specs.length, page, pageSize, hasMore: false } };
}
export function archiveScheduleSpec(userId: string, workspaceName: string, specId: string, reason: ScheduleSpecArchiveReason) { return apiJson<{ spec: ScheduleSpecArchive }>(withUserId(`${base}/archive`, userId), { method: "POST", body: JSON.stringify({ workspaceName, specId, reason }) }); }
export function restoreScheduleSpec(userId: string, workspaceName: string, specId: string) { return apiJson<{ ok: true }>(withUserId(`${base}/restore`, userId), { method: "POST", body: JSON.stringify({ workspaceName, specId }) }); }
