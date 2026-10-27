import type { WorkspaceSummary } from "../hooks/useWorkspaces.js";

export interface RepositoryConnectionSummary {
  projectCount: number;
  remoteProjectCount: number;
  providerCounts: Record<string, number>;
  providerProjects: Record<string, RepositoryProjectConnection[]>;
  providerSummary: string;
}

export interface RepositoryProjectConnection {
  workspaceName: string;
  projectName: string;
  projectPath: string;
  repository: string;
  remoteUrl: string;
}

export function summarizeRepositoryConnections(workspaces: WorkspaceSummary[] | null): RepositoryConnectionSummary {
  const projects = Array.from(new Map(
    (workspaces ?? []).flatMap((workspace) => workspace.projects.map((project) => ({ workspaceName: workspace.name, project })))
      .map((entry) => [entry.project.project_path, entry] as const),
  ).values());
  const providerCounts: Record<string, number> = {};
  const providerProjects: Record<string, RepositoryProjectConnection[]> = {};
  for (const { workspaceName, project } of projects) {
    if (!project.remote_git) continue;
    providerCounts[project.remote_git.providerLabel] = (providerCounts[project.remote_git.providerLabel] ?? 0) + 1;
    providerProjects[project.remote_git.provider] ??= [];
    providerProjects[project.remote_git.provider].push({
      workspaceName,
      projectName: project.project_path.split(/[\\/]/).filter(Boolean).at(-1) ?? project.project_path,
      projectPath: project.project_path,
      repository: project.remote_git.repository,
      remoteUrl: project.remote_git.remoteUrl,
    });
  }
  const providerSummary = Object.entries(providerCounts)
    .map(([provider, count]) => `${provider} ${count}`)
    .join(" · ");
  return {
    projectCount: projects.length,
    remoteProjectCount: Object.values(providerCounts).reduce((sum, count) => sum + count, 0),
    providerCounts,
    providerProjects,
    providerSummary,
  };
}
