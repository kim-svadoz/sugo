interface ReleaseInput {
  baseBranch: string;
  latestBuildNumber: number | null;
  latestBuildCommit: string | null;
}

interface LocalGitInput {
  branch: string | null;
  headCommit: string | null;
  baseCommit: string | null;
  dirty: boolean;
}

export type ReleaseComparison = "UNCOMMITTED" | "COMMIT_NOT_BUILT" | "BUILT_NOT_DEPLOYED" | "DEPLOYED" | "UNKNOWN";

export function compareRelease(release: ReleaseInput | null, local: LocalGitInput, deployedImageVersions: Array<string | null>): ReleaseComparison {
  if (!release?.latestBuildCommit || !local.baseCommit || release.latestBuildNumber === null) return "UNKNOWN";
  if (local.branch === release.baseBranch && local.dirty) return "UNCOMMITTED";
  if (release.latestBuildCommit !== local.baseCommit) return "COMMIT_NOT_BUILT";
  const expected = String(release.latestBuildNumber);
  const knownImages = deployedImageVersions.filter((value): value is string => value !== null);
  if (knownImages.length === 0) return "UNKNOWN";
  return knownImages.every((value) => value === expected) ? "DEPLOYED" : "BUILT_NOT_DEPLOYED";
}

export function shortCommit(value: string | null): string {
  return value?.slice(0, 8) ?? "미확인";
}
