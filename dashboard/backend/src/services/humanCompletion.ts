import { createHash, randomUUID } from "node:crypto";
import type { DbClient } from "../db/client.js";
import { parseMaybeJson } from "../db/jsonColumn.js";

export interface CompletionLabel {
  kind: string; reason: string; patchVersion: number; recordedAt: string;
  implementationCycle?: number; supersededAt?: string; supersededByCycle?: number;
}
export interface ApprovalEvent {
  labelId: string; action: "approve" | "revoke"; userId: string; at: string;
  kind: string; originalReason: string; reason: string; workResultPath: string;
}
interface Result {
  path?: string;
  parentTaskId?: string;
  report?: { patchVersion: number; completedAt?: string; completionGrade: string; bypassLabels?: CompletionLabel[]; humanApprovals?: ApprovalEvent[]; [key: string]: unknown };
  [key: string]: unknown;
}
export const completionLabelId = (l: CompletionLabel): string => JSON.stringify([l.kind, l.reason, l.patchVersion, l.recordedAt, l.implementationCycle ?? 0]);
const superseded = (l: CompletionLabel): boolean => l.kind === "evidenceResnapshot" && !!l.supersededAt && (l.supersededByCycle ?? 0) > (l.implementationCycle ?? 0);
export function completionResultKey(value: unknown): string {
  const result = parseMaybeJson<Result | null>(value, null);
  return createHash("sha256").update(JSON.stringify([result?.path, result?.report?.patchVersion, result?.report?.completedAt,
    result?.report?.bypassLabels?.map(l => [completionLabelId(l), l.supersededAt])])).digest("hex");
}
const migrations = new WeakMap<DbClient, Promise<void>>();
/** Append-only, no foreign-key cascade: node deletion must not destroy an approval audit. */
export function ensureHumanCompletionTable(db: DbClient): Promise<void> {
  let migration = migrations.get(db);
  if (!migration) {
    migration = db.exec(`CREATE TABLE IF NOT EXISTS sugo_completion_approval_events (
      sequence_id ${db.dialect === "mysql" ? "BIGINT AUTO_INCREMENT" : "INTEGER"} PRIMARY KEY,
      id VARCHAR(36) NOT NULL UNIQUE, user_id VARCHAR(255) NOT NULL,
      workspace_name VARCHAR(255) NOT NULL, node_id VARCHAR(255) NOT NULL,
      result_key VARCHAR(64) NOT NULL, recorded_at VARCHAR(40) NOT NULL, event_json ${db.dialect === "mysql" ? "LONGTEXT" : "TEXT"} NOT NULL
    )${db.dialect === "mysql" ? " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4" : ""}`).then(() => undefined).catch(error => { migrations.delete(db); throw error; });
    migrations.set(db, migration);
  }
  return migration;
}
export async function readApprovalEvents(db: DbClient, userId: string, workspace: string, nodeId: string, resultKey?: string): Promise<ApprovalEvent[]> {
  await ensureHumanCompletionTable(db);
  const rows = await db.query<{ event_json: unknown }>(
    `SELECT event_json FROM sugo_completion_approval_events WHERE user_id = ? AND workspace_name = ? AND node_id = ?${resultKey ? " AND result_key = ?" : ""} ORDER BY sequence_id`,
    [userId, workspace, nodeId, ...(resultKey ? [resultKey] : [])]);
  return rows.map(r => parseMaybeJson<ApprovalEvent>(r.event_json, {} as ApprovalEvent));
}
/** Strip dashboard-owned approvals recursively, including legacy lineage copies. */
export function stripHumanCompletion(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripHumanCompletion);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== "humanApprovals" && key !== "approvalResultKey").map(([key, v]) =>
    [key, key === "completionGrade" && v === "verified_by_human" ? "unverified" : stripHumanCompletion(v)]));
}
export async function projectHumanCompletion(db: DbClient, userId: string, workspace: string, nodeId: string, value: unknown): Promise<unknown> {
  const result = parseMaybeJson<Result | null>(value, null);
  if (!result?.report) return result;
  if (result.parentTaskId && result.parentTaskId !== nodeId) {
    const owners = await db.query<{ work_result: unknown }>("SELECT work_result FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id = ? AND level = 'task'", [userId, workspace, result.parentTaskId]);
    const owner = parseMaybeJson<Result | null>(owners[0]?.work_result, null);
    if (owner?.path === result.path && owner?.report?.patchVersion === result.report.patchVersion) {
      const projected = await projectHumanCompletion(db, userId, workspace, result.parentTaskId, owner) as Result;
      return { ...result, report: { ...result.report, completionGrade: projected.report!.completionGrade,
        bypassLabels: projected.report!.bypassLabels, humanApprovals: projected.report!.humanApprovals } };
    }
  }
  const report = { ...result.report, humanApprovals: await readApprovalEvents(db, userId, workspace, nodeId, completionResultKey(result)) };
  const labels = report.bypassLabels?.filter(l => l.patchVersion === report.patchVersion && !superseded(l));
  if (labels) {
    const latest = new Map(report.humanApprovals.map(e => [e.labelId, e]));
    report.completionGrade = !labels.length ? "verified" : labels.every(l => {
      const e = latest.get(completionLabelId(l));
      return e?.action === "approve" && e.reason.trim() && e.userId && e.kind === l.kind && e.originalReason === l.reason;
    }) ? "verified_by_human" : "unverified";
  } else if (report.completionGrade === "verified_by_human") report.completionGrade = "unverified";
  return { ...result, report, approvalResultKey: completionResultKey(result) };
}
export async function changeHumanApproval(db: DbClient, userId: string, workspace: string, input: {
  nodeId: string; resultKey: string; labelId: string; action: "approve" | "revoke"; reason: string;
}): Promise<{ ok: boolean; error?: string }> {
  const rows = await db.query<{ work_result: unknown; result_text: string; status: string; level: string }>(
    "SELECT work_result, CAST(work_result AS CHAR) AS result_text, status, level FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id = ?", [userId, workspace, input.nodeId]);
  const row = rows[0];
  if (!row || row.level !== "task" || row.status !== "done") return { ok: false, error: "COMPLETED_TASK_REQUIRED" };
  const result = parseMaybeJson<Result | null>(row.work_result, null);
  if (!result?.path || !result.report || completionResultKey(result) !== input.resultKey) return { ok: false, error: "WORK_RESULT_CHANGED" };
  const label = result.report.bypassLabels?.find(l => completionLabelId(l) === input.labelId && l.patchVersion === result.report!.patchVersion && !superseded(l));
  if (!label || !input.reason.trim()) return { ok: false, error: "ACTIVE_LABEL_AND_REASON_REQUIRED" };
  await ensureHumanCompletionTable(db);
  const event: ApprovalEvent = { labelId: input.labelId, action: input.action, userId, at: new Date().toISOString(),
    kind: label.kind, originalReason: label.reason, reason: input.reason.trim(), workResultPath: result.path };
  // INSERT .. SELECT guards the report identity even if sync runs between the read and this insert.
  const inserted = await db.exec(`INSERT INTO sugo_completion_approval_events (id, user_id, workspace_name, node_id, result_key, recorded_at, event_json)
    SELECT ?, ?, ?, ?, ?, ?, ? FROM sugo_roadmap_nodes WHERE user_id = ? AND workspace_name = ? AND id = ? AND CAST(work_result AS ${db.dialect === "mysql" ? "BINARY" : "TEXT"}) = ? AND status = 'done'`,
    [randomUUID(), userId, workspace, input.nodeId, input.resultKey, event.at, JSON.stringify(event), userId, workspace, input.nodeId,
      row.result_text]);
  return inserted.affectedRows === 1 ? { ok: true } : { ok: false, error: "WORK_RESULT_CHANGED" };
}
