import { apiJson, withUserId } from "./client.js";

export type CommitmentState = "planned" | "active" | "completed" | "cancelled";
export type CommitmentTarget = "implementation" | "review" | "dev" | "stg" | "prd" | "custom";

export interface ScheduleCommitment {
  id: string;
  spec_id: string;
  workspace_name: string;
  title: string;
  due_date: string | null;
  state: CommitmentState;
  target: CommitmentTarget;
  linked_run_id: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

const base = "/api/schedule/commitments";

export async function getScheduleCommitments(userId: string): Promise<ScheduleCommitment[]> {
  const result = await apiJson<{ commitments: ScheduleCommitment[] }>(withUserId(base, userId));
  return result.commitments;
}

export function createScheduleCommitment(userId: string, input: {
  specId: string;
  workspaceName: string;
  title: string;
  dueDate: string | null;
  state?: CommitmentState;
  target: CommitmentTarget;
  linkedRunId?: string | null;
}) {
  return apiJson<{ commitment: ScheduleCommitment }>(withUserId(base, userId), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function completeScheduleCommitment(userId: string, id: string) {
  return apiJson<{ commitment: ScheduleCommitment }>(withUserId(`${base}/${encodeURIComponent(id)}/complete`, userId), { method: "POST" });
}

export function updateScheduleCommitment(userId: string, commitment: Pick<ScheduleCommitment, "id" | "title" | "due_date" | "state" | "target" | "linked_run_id">) {
  return apiJson<{ commitment: ScheduleCommitment }>(withUserId(`${base}/${encodeURIComponent(commitment.id)}`, userId), {
    method: "PUT",
    body: JSON.stringify({
      title: commitment.title,
      dueDate: commitment.due_date,
      state: commitment.state,
      target: commitment.target,
      linkedRunId: commitment.linked_run_id,
    }),
  });
}

export function reopenScheduleCommitment(userId: string, id: string) {
  return apiJson<{ commitment: ScheduleCommitment }>(withUserId(`${base}/${encodeURIComponent(id)}/reopen`, userId), { method: "POST" });
}
