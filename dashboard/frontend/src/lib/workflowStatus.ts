/** Human workflow status is distinct from the recorded pipeline stage. */
export function workflowStatus(n: { display_status?: string; status?: string | null; manual_status?: string | null; level?: string; work_result?: unknown }): string {
  if (n.display_status) return n.display_status;
  const status = (n.manual_status ?? n.status ?? "pending").toLowerCase();
  return status === "done" && n.level === "task" && needsVerification(n) ? "verification" : status;
}

export function needsVerification(n: { work_result?: unknown }): boolean {
  let result: any = n.work_result;
  if (typeof result === "string") { try { result = JSON.parse(result); } catch { result = null; } }
  return result?.report?.completionGrade === "unverified";
}
