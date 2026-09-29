import type { PrRefs } from "../services/prService.js";

export const gitProviderIds = ["github", "gitlab", "bitbucket_server", "aws_codecommit"] as const;
export type GitProviderId = (typeof gitProviderIds)[number];

export interface GitProviderConnection {
  provider: GitProviderId;
  token: string;
  baseUrl: string | null;
  profile?: string | null;
}

export interface GitRepositoryRef {
  baseUrl: string;
  namespace: string;
  repo: string;
  token: string;
  profile?: string | null;
}

export interface PullRequestRef {
  id: number | string;
  url: string;
}

export interface GitProviderClient {
  remoteBranchExists(repo: GitRepositoryRef, branch: string): Promise<boolean>;
  findOpenPr(repo: GitRepositoryRef, fromBranch: string): Promise<PullRequestRef | null>;
  createPullRequest(
    repo: GitRepositoryRef,
    input: { title: string; description?: string; fromBranch: string; toBranch: string }
  ): Promise<PullRequestRef>;
}

export interface GitProviderDescriptor {
  id: GitProviderId;
  label: string;
  pullRequests: boolean;
  selfHosted: boolean;
  defaultBaseUrl: string | null;
  status: "available" | "planned";
  authMode: "token" | "aws_default_chain";
}

export const gitProviderCatalog: GitProviderDescriptor[] = [
  { id: "github", label: "GitHub", pullRequests: true, selfHosted: false, defaultBaseUrl: "https://api.github.com", status: "available", authMode: "token" },
  { id: "gitlab", label: "GitLab", pullRequests: true, selfHosted: true, defaultBaseUrl: "https://gitlab.com", status: "available", authMode: "token" },
  { id: "bitbucket_server", label: "Bitbucket Server / Data Center", pullRequests: true, selfHosted: true, defaultBaseUrl: null, status: "available", authMode: "token" },
  { id: "aws_codecommit", label: "AWS CodeCommit", pullRequests: true, selfHosted: false, defaultBaseUrl: null, status: "available", authMode: "aws_default_chain" },
];

export function detectGitProvider(refs: PrRefs): GitProviderId {
  if (refs.provider && gitProviderIds.includes(refs.provider as GitProviderId)) return refs.provider as GitProviderId;
  const remote = `${refs.remoteUrl ?? ""} ${refs.baseUrl ?? ""}`.toLowerCase();
  if (remote.includes("github.com")) return "github";
  if (remote.includes("gitlab")) return "gitlab";
  if (remote.includes("git-codecommit.")) return "aws_codecommit";
  return "bitbucket_server";
}

export function repositoryFor(refs: PrRefs, connection: GitProviderConnection): GitRepositoryRef {
  const descriptor = gitProviderCatalog.find((candidate) => candidate.id === connection.provider)!;
  const refBaseUrl = connection.provider === "github" && /^https:\/\/github\.com\/?$/i.test(refs.baseUrl)
    ? null
    : refs.baseUrl;
  const codeCommitRegion = connection.provider === "aws_codecommit"
    ? `${refs.remoteUrl ?? ""} ${refs.baseUrl ?? ""}`.match(/git-codecommit\.([a-z0-9-]+)\.amazonaws\.com/i)?.[1] ?? ""
    : "";
  return {
    baseUrl: connection.provider === "aws_codecommit" ? codeCommitRegion : connection.baseUrl ?? refBaseUrl ?? descriptor.defaultBaseUrl ?? "",
    namespace: refs.projectKey,
    repo: refs.repoSlug,
    token: connection.token,
    profile: connection.profile,
  };
}
