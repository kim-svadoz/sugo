export type RepositoryBadgeTone = "local" | "remote" | "suggested" | "confirmed";

export interface RepositoryConnectionBadge {
  label: string;
  tone: RepositoryBadgeTone;
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
