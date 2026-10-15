import { apiJson, withUserId } from "./client.js";

export type ScheduleSpecArchiveReason = "deleted" | "closed";
export interface ScheduleSpecArchive { workspace_name: string; spec_id: string; title: string; reason: ScheduleSpecArchiveReason; archived_at: string; archived_by: string }
const base = "/api/schedule/specs";
export async function getScheduleSpecArchives(userId: string) { return (await apiJson<{ specs: ScheduleSpecArchive[] }>(withUserId(`${base}/archive`, userId))).specs; }
export function archiveScheduleSpec(userId: string, workspaceName: string, specId: string, reason: ScheduleSpecArchiveReason) { return apiJson<{ spec: ScheduleSpecArchive }>(withUserId(`${base}/archive`, userId), { method: "POST", body: JSON.stringify({ workspaceName, specId, reason }) }); }
export function restoreScheduleSpec(userId: string, workspaceName: string, specId: string) { return apiJson<{ ok: true }>(withUserId(`${base}/restore`, userId), { method: "POST", body: JSON.stringify({ workspaceName, specId }) }); }
