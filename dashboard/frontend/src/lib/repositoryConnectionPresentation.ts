export type RepositoryBadgeTone = "local" | "remote" | "suggested" | "confirmed";

export interface RepositoryConnectionBadge {
  label: string;
  tone: RepositoryBadgeTone;
}

interface RemoteRepository {
  provider: "github" | "gitlab" | "bitbucket_server" | "aws_codecommit" | "git_remote";
  remoteUrl: string;
  repository: string;
}

export function remoteRepositoryBrowserUrl(remote: RemoteRepository): string | null {
  if (remote.provider === "github") {
    const repository = remote.repository.replace(/^\/+|\.git$/gi, "");
    return /^[^/\s]+\/[^/\s]+$/.test(repository) ? `https://github.com/${repository}` : null;
  }

  if (remote.provider === "aws_codecommit") {
    const region = remote.remoteUrl.match(/git-codecommit\.([a-z0-9-]+)\.amazonaws\.com/i)?.[1]
      ?? remote.remoteUrl.match(/^codecommit::([a-z0-9-]+):\/\//i)?.[1];
    const repository = remote.repository.replace(/^\/+|\.git$/gi, "");
    if (!region || !repository || /[/?#\s]/.test(repository)) return null;
    return `https://console.aws.amazon.com/codesuite/codecommit/home?region=${encodeURIComponent(region)}#/repository/${encodeURIComponent(repository)}/browse/HEAD/--/`;
  }

  return null;
}

export function repositoryConnectionBadges(input: {
  localGitAvailable: boolean;
  remoteProviderLabel: string | null;
  awsLinkMode: "suggested" | "confirmed" | null;
}): RepositoryConnectionBadge[] {
  const badges: RepositoryConnectionBadge[] = [];
  if (input.localGitAvailable) badges.push({ label: "로컬 Git", tone: "local" });
  if (input.remoteProviderLabel) badges.push({ label: `원격 · ${input.remoteProviderLabel}`, tone: "remote" });
  if (input.awsLinkMode === "suggested") badges.push({ label: "운영 연결 후보", tone: "suggested" });
  if (input.awsLinkMode === "confirmed") badges.push({ label: "AWS 서비스 상태 연동", tone: "confirmed" });
  return badges;
}
