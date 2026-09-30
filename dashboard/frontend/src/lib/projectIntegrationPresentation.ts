import type { IntegrationCandidate, ProjectIntegration } from "../api/projectIntegrationsApi.js";

type AwsAccountIdentity = { name: string; profile: string; region: string; accountHint: string; principal: string | null };

export function awsAccountOptionLabel(account: AwsAccountIdentity): string {
  return `${account.name} · ••••${account.accountHint}`;
}

export function awsAccountMetaLabel(account: AwsAccountIdentity): string {
  return [`profile ${account.profile}`, account.region, account.principal].filter(Boolean).join(" · ");
}

type KeyFn = (item: { accountName: string; service: string; cluster?: string | null }) => string;

export function isExactIntegrationCandidate(projectPath: string, item: IntegrationCandidate): boolean {
  const repositoryName = projectPath.split(/[\\/]/).filter(Boolean).at(-1)?.toLowerCase() ?? "";
  const serviceName = item.service.toLowerCase().replace(/-service$/, "");
  return serviceName === repositoryName || item.images.some((image) => image.split("/").at(-1)?.split(":")[0]?.toLowerCase() === repositoryName);
}

export function initialIntegrationSelection(project: ProjectIntegration | undefined, candidates: IntegrationCandidate[], key: KeyFn): string[] {
  if (!project) return [];
  if (project.configured) return project.selections.map(key);
  return candidates.filter((candidate) => isExactIntegrationCandidate(project.project_path, candidate)).map(key);
}

export function integrationStatusLabel(project: Pick<ProjectIntegration, "configured" | "selections">): string {
  if (!project.configured) return "AWS/APM 미확정";
  if (project.selections.length === 0) return "외부 연동 사용 안 함";
  return `AWS/APM ${project.selections.length}개 확정`;
}

export function partitionIntegrationCandidates(candidates: IntegrationCandidate[], selected: string[], key: KeyFn) {
  const selectedSet = new Set(selected);
  return {
    available: candidates.filter((candidate) => !selectedSet.has(key(candidate))),
    applied: candidates.filter((candidate) => selectedSet.has(key(candidate))),
  };
}

export function moveIntegrationKeys(current: string[], checked: string[], direction: "add" | "remove"): string[] {
  if (direction === "add") return [...new Set([...current, ...checked])];
  const removed = new Set(checked);
  return current.filter((value) => !removed.has(value));
}
