export function findScheduleReviewTarget<T extends { id: string; workspace_name: string }>(
  specs: readonly T[],
  workspace: string,
  specId: string | null,
  needsAttention: (spec: T) => boolean,
): T | undefined {
  const workspaceSpecs = specs.filter((spec) => spec.workspace_name === workspace);
  if (specId) {
    const exact = workspaceSpecs.find((spec) => spec.id === specId);
    if (exact) return exact;
  }
  return workspaceSpecs.find(needsAttention) ?? workspaceSpecs[0];
}
