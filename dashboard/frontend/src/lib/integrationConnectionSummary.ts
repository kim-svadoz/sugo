import type { WorkspaceSummary } from "../hooks/useWorkspaces.js";

export interface RepositoryConnectionSummary {
  projectCount: number;
  remoteProjectCount: number;
  providerCounts: Record<string, number>;
  providerSummary: string;
}

export function summarizeRepositoryConnections(workspaces: WorkspaceSummary[] | null): RepositoryConnectionSummary {
  const projects = Array.from(new Map(
    (workspaces ?? []).flatMap((workspace) => workspace.projects)
      .map((project) => [project.project_path, project] as const),
  ).values());
  const providerCounts: Record<string, number> = {};
  for (const project of projects) {
    if (!project.remote_git) continue;
    providerCounts[project.remote_git.providerLabel] = (providerCounts[project.remote_git.providerLabel] ?? 0) + 1;
  }
  const providerSummary = Object.entries(providerCounts)
    .map(([provider, count]) => `${provider} ${count}`)
    .join(" · ");
  return {
    projectCount: projects.length,
    remoteProjectCount: Object.values(providerCounts).reduce((sum, count) => sum + count, 0),
    providerCounts,
    providerSummary,
  };
}
