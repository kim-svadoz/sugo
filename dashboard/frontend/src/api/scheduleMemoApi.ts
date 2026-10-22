import { apiJson, withUserId } from "./client.js";

export interface ScheduledMemo {
  id: string;
  title: string;
  content_md: string;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
}

const base = "/api/schedule/memos";

export async function getScheduleMemos(userId: string): Promise<ScheduledMemo[]> {
  return (await apiJson<{ memos: ScheduledMemo[] }>(withUserId(base, userId))).memos;
}

export async function getArchivedScheduleMemos(userId: string): Promise<ScheduledMemo[]> {
  return (await apiJson<{ memos: ScheduledMemo[] }>(withUserId(`${base}/archive`, userId))).memos;
}

export function createScheduleMemo(userId: string, input: { title: string; contentMd: string; dueDate: string | null }) {
  return apiJson<{ memo: ScheduledMemo }>(withUserId(base, userId), { method: "POST", body: JSON.stringify(input) });
}

export function updateScheduleMemo(userId: string, id: string, input: { title: string; contentMd: string; dueDate: string | null }) {
  return apiJson<{ memo: ScheduledMemo }>(withUserId(`${base}/${encodeURIComponent(id)}`, userId), { method: "PUT", body: JSON.stringify(input) });
}

export function setScheduleMemoDueDate(userId: string, id: string, dueDate: string | null) {
  return apiJson<{ ok: true }>(withUserId(`${base}/${encodeURIComponent(id)}/due-date`, userId), { method: "PATCH", body: JSON.stringify({ dueDate }) });
}

export function deleteScheduleMemo(userId: string, id: string) {
  return apiJson<{ ok: true }>(withUserId(`${base}/${encodeURIComponent(id)}`, userId), { method: "DELETE" });
}

export function restoreScheduleMemo(userId: string, id: string) {
  return apiJson<{ ok: true }>(withUserId(`${base}/${encodeURIComponent(id)}/restore`, userId), { method: "POST" });
}
