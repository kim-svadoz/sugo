import type { ScheduledSpec } from "../api/roadmapMutationsApi.js";

export type SpecWriterProvider = "claude" | "codex";
export type ScheduleSpecStage = "draft" | "ready" | "in_progress";

export function scheduleSpecStage(spec: ScheduledSpec): ScheduleSpecStage {
  if (spec.has_run) return "in_progress";
  return spec.spec_path ? "ready" : "draft";
}

function quoted(value: string): string {
  return JSON.stringify(value);
}

export function buildSpecWriterCommand(spec: ScheduledSpec, provider: SpecWriterProvider): string {
  if (!spec.project_path) throw new Error("PROJECT_REQUIRED");
  const args = `--workspace ${quoted(spec.workspace_name)} --project ${quoted(spec.project_path)} --spec-draft ${quoted(spec.id)}`;
  if (provider === "claude") return `/sugo:spec-writer ${args}`;
  return `$sugo:spec-writer 스킬을 사용해 ${args} 에 연결된 SPEC을 작성해줘.`;
}

export function buildFeatCommand(spec: ScheduledSpec): string {
  if (!spec.project_path || !spec.spec_path) throw new Error("SPEC_NOT_READY");
  const branch = spec.work_branch ? ` --branch ${quoted(spec.work_branch)}` : "";
  return `/sugo:feat --project ${quoted(spec.project_path)} --spec ${quoted(spec.spec_path)} --spec-draft ${quoted(spec.id)}${branch} ${quoted(spec.title)}`;
}

export function buildPatchCommand(workResultPath: string): string {
  if (!workResultPath.trim()) throw new Error("WORK_RESULT_REQUIRED");
  return `/sugo:patch ${quoted(workResultPath)}`;
}

export function buildPatchAttachCommand(workResultPath: string): string {
  if (!workResultPath.trim()) throw new Error("WORK_RESULT_REQUIRED");
  return `/sugo:patch-attach ${quoted(workResultPath)}`;
}
