export type RemoteGitProvider = "github" | "gitlab" | "bitbucket_server" | "aws_codecommit" | "git_remote";

export interface RemoteGitState {
  remoteUrl: string;
  provider: RemoteGitProvider;
  providerLabel: string;
  repository: string;
}

function repositoryFromUrl(remoteUrl: string): string {
  const codeCommit = remoteUrl.match(/\/v1\/repos\/([^/?#]+)/i)?.[1];
  if (codeCommit) return codeCommit.replace(/\.git$/i, "");
  const withoutQuery = remoteUrl.split(/[?#]/, 1)[0] ?? remoteUrl;
  const scpPath = withoutQuery.match(/^[^/@\s]+@[^:\s]+:(.+)$/)?.[1];
  const path = scpPath ?? withoutQuery.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+\/?/i, "");
  return path.replace(/^\/+/, "").replace(/^scm\//i, "").replace(/\.git$/i, "");
}

export function describeRemoteGit(remoteUrl: string): RemoteGitState {
  const normalized = remoteUrl.toLowerCase();
  const provider: RemoteGitProvider = normalized.includes("github.com")
    ? "github"
    : normalized.includes("gitlab")
      ? "gitlab"
      : normalized.includes("git-codecommit.")
        ? "aws_codecommit"
        : normalized.includes("bitbucket")
          ? "bitbucket_server"
          : "git_remote";
  const providerLabel = provider === "github"
    ? "GitHub"
    : provider === "gitlab"
      ? "GitLab"
      : provider === "aws_codecommit"
        ? "AWS CodeCommit"
        : provider === "bitbucket_server"
          ? "Bitbucket Server"
          : "Git 원격 저장소";
  return { remoteUrl, provider, providerLabel, repository: repositoryFromUrl(remoteUrl) };
}
