import { describe, expect, it } from "vitest";
import { summarizeRepositoryConnections } from "./integrationConnectionSummary.js";
import type { WorkspaceSummary } from "../hooks/useWorkspaces.js";

function workspace(projects: WorkspaceSummary["projects"]): WorkspaceSummary {
  return { name: "test", projects } as WorkspaceSummary;
}

function project(path: string, providerLabel?: string): WorkspaceSummary["projects"][number] {
  return {
    project_path: path,
    remote_git: providerLabel ? { remoteUrl: "remote", provider: "aws_codecommit", providerLabel, repository: path } : null,
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
      workspace([project("recom", "AWS CodeCommit"), project("user", "AWS CodeCommit"), project("local-only")]),
    ]);
    expect(result).toMatchObject({
      projectCount: 3,
      remoteProjectCount: 2,
      providerCounts: { "AWS CodeCommit": 2 },
      providerSummary: "AWS CodeCommit 2",
    });
  });
});
