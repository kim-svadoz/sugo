export function scheduleSpecPath(workspace: string, specId: string, returnTo?: "home"): string {
  const params = new URLSearchParams({ reviewWorkspace: workspace, reviewSpec: specId });
  if (returnTo) params.set("returnTo", returnTo);
  return `/schedule?${params}`;
}

export function findScheduleReviewTarget<T extends { id: string; workspace_name: string }>(
  specs: readonly T[],
  workspace: string,
  specId: string | null,
): T | undefined {
  return specs.find((spec) => spec.workspace_name === workspace && spec.id === specId);
}
