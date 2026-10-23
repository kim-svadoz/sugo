interface TitledSpec {
  workspace_name: string;
  title: string;
  development_history?: ReadonlyArray<{ task_id: string; version: number; title: string; work_result_path?: string | null }>;
}

/** 활동 이벤트의 작업을 일정 제목과 최신 FEAT/PATCH 차수로 바꾼다. 찾지 못하면 이벤트의 작업 이름을 쓴다. */
export function resolveTaskTitle(task: { workspace: string; taskId?: string; name: string }, specs: readonly TitledSpec[]): { title: string; kind: string | null } {
  const spec = specs.find((candidate) => candidate.workspace_name === task.workspace && (candidate.development_history ?? []).some((history) =>
    task.taskId ? history.task_id === task.taskId : history.title === task.name || (history.work_result_path ?? "").split("/").includes(task.name)));
  if (!spec) return { title: task.name, kind: null };
  const latest = Math.max(...(spec.development_history ?? []).map((history) => history.version));
  return { title: spec.title, kind: latest > 0 ? `PATCH ${latest}` : "FEAT" };
}
