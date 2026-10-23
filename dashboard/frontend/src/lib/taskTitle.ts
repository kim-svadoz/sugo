interface TitledSpec {
  id?: string;
  workspace_name: string;
  project_path?: string | null;
  title: string;
  development_history?: ReadonlyArray<{ task_id: string; version: number; title: string; work_result_path?: string | null }>;
}

/** 활동 이벤트의 작업을 일정 제목과 최신 FEAT/PATCH 차수로 바꾼다. 찾지 못하면 이벤트의 작업 이름을 쓴다. */
export interface ResolvedTaskTitle { title: string; kind: string | null; project: string | null; linked: boolean }

export function resolveTaskTitle(task: { workspace: string; taskId?: string; specId?: string; projectPath?: string; name: string }, specs: readonly TitledSpec[]): ResolvedTaskTitle {
  const spec = specs.find((candidate) => candidate.id === task.specId) ?? specs.find((candidate) => candidate.workspace_name === task.workspace && (!task.projectPath || candidate.project_path === task.projectPath) && (candidate.development_history ?? []).some((history) =>
    task.taskId ? history.task_id === task.taskId : history.title === task.name || (history.work_result_path ?? "").split("/").includes(task.name)));
  if (!spec) return { title: task.name, kind: null, project: null, linked: false };
  const latest = Math.max(...(spec.development_history ?? []).map((history) => history.version));
  const project = spec.project_path?.split(/[\\/]/).filter(Boolean).pop() ?? null;
  return { title: spec.title, kind: latest > 0 ? `PATCH ${latest}` : "FEAT", project, linked: true };
}
