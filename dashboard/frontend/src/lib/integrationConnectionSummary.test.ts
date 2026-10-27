import { describe, expect, it } from "vitest";
import { summarizeRepositoryConnections } from "./integrationConnectionSummary.js";
import type { WorkspaceSummary } from "../hooks/useWorkspaces.js";

function workspace(name: string, projects: WorkspaceSummary["projects"]): WorkspaceSummary {
  return { name, projects } as WorkspaceSummary;
}

function project(path: string, provider?: { id: "github" | "aws_codecommit"; label: string; repository: string }): WorkspaceSummary["projects"][number] {
  return {
    project_path: path,
    remote_git: provider ? { remoteUrl: `remote:${provider.repository}`, provider: provider.id, providerLabel: provider.label, repository: provider.repository } : null,
    local_git: { branch: "main", headCommit: "abc", baseCommit: "abc", dirty: false },
    git_synced: 0,
    aws_synced: 0,
    aws_release: null,
    aws_deployments: [],
  };
}

describe("summarizeRepositoryConnections", () => {
  it("separates registered local projects from projects with an actual remote", () => {
    const result = summarizeRepositoryConnections([
      workspace("test", [
        project("recom", { id: "aws_codecommit", label: "AWS CodeCommit", repository: "recom-api" }),
        project("user", { id: "aws_codecommit", label: "AWS CodeCommit", repository: "user-api" }),
        project("local-only"),
      ]),
    ]);
    expect(result).toMatchObject({
      projectCount: 3,
      remoteProjectCount: 2,
      providerCounts: { "AWS CodeCommit": 2 },
      providerSummary: "AWS CodeCommit 2",
    });
  });

  it("keeps the workspace, local project, and remote repository for each provider", () => {
    const result = summarizeRepositoryConnections([
      workspace("catalog", [project("/work/catalog-api", { id: "aws_codecommit", label: "AWS CodeCommit", repository: "catalog-api" })]),
      workspace("user-profile", [project("/work/user-api", { id: "github", label: "GitHub", repository: "team/user-api" })]),
    ]);

    expect(result.providerProjects).toEqual({
      aws_codecommit: [{ workspaceName: "catalog", projectName: "catalog-api", projectPath: "/work/catalog-api", repository: "catalog-api", remoteUrl: "remote:catalog-api" }],
      github: [{ workspaceName: "user-profile", projectName: "user-api", projectPath: "/work/user-api", repository: "team/user-api", remoteUrl: "remote:team/user-api" }],
    });
  });
});
