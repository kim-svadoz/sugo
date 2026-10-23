interface TitledSpec {
  id?: string;
  workspace_name: string;
  project_path?: string | null;
  title: string;
  focus_task_id?: string | null;
  development_history?: ReadonlyArray<{ task_id: string; version: number; title: string; summary?: string | null; completed_at?: string | null; work_result_path?: string | null }>;
}

/** 활동 이벤트의 작업을 일정 제목과 최신 FEAT/PATCH 차수로 바꾼다. 찾지 못하면 이벤트의 작업 이름을 쓴다. */
export interface ResolvedTaskTitle { title: string; kind: string | null; project: string | null; summary: string | null; linked: boolean }

export function resolveTaskTitle(task: { workspace: string; taskId?: string; specId?: string; projectPath?: string; name: string; at?: number }, specs: readonly TitledSpec[]): ResolvedTaskTitle {
  const candidates = specs.filter((candidate) => candidate.workspace_name === task.workspace && (!task.projectPath || candidate.project_path === task.projectPath));
  const spec = specs.find((candidate) => candidate.id === task.specId) ?? candidates.find((candidate) => (candidate.development_history ?? []).some((history) =>
    task.taskId ? history.task_id === task.taskId : history.title === task.name || (history.work_result_path ?? "").split("/").includes(task.name))) ?? (task.taskId ? candidates.find((candidate) => candidate.focus_task_id === task.taskId) : undefined) ?? (task.at ? candidates.find((candidate) => (candidate.development_history ?? []).some((history) => history.completed_at && Math.abs(Date.parse(history.completed_at) - task.at!) < 5_000)) : undefined);
  if (!spec) return { title: task.name, kind: null, project: null, summary: null, linked: false };
  const latestHistory = [...(spec.development_history ?? [])].sort((a, b) => b.version - a.version)[0];
  const latest = latestHistory?.version ?? 0;
  const project = spec.project_path?.split(/[\\/]/).filter(Boolean).pop() ?? null;
  const title = /^(?:테스트\s*)?스펙$/i.test(spec.title.trim()) ? latestHistory?.title ?? spec.title : spec.title;
  return { title, kind: latest > 0 ? `PATCH ${latest}` : "FEAT", project, summary: latestHistory?.summary?.trim() || null, linked: true };
}
