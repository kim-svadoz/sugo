export interface WorkspaceScopedResult<T> {
  workspace: string;
  value: T;
}

export function resultForWorkspace<T>(
  state: WorkspaceScopedResult<T> | null,
  workspace: string | null,
): T | null {
  return state?.workspace === workspace ? state.value : null;
}
