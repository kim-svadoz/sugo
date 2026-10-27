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
  if (!project.configured) return "서비스 매핑 필요";
  if (project.selections.length === 0) return "서비스 연동 미사용";
  return `서비스 ${project.selections.length}개 연결`;
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

export function hasIntegrationSelectionChanges(
  saved: Array<{ accountName: string; service: string; cluster?: string | null }>,
  selected: string[],
  key: KeyFn,
): boolean {
  const savedKeys = saved.map(key).sort();
  const selectedKeys = [...selected].sort();
  return savedKeys.length !== selectedKeys.length || savedKeys.some((value, index) => value !== selectedKeys[index]);
}

export function summarizeSavedIntegrations(
  selections: Array<{ environment: string; service: string }>,
): Array<{ environment: string; services: string[] }> {
  const grouped = new Map<string, string[]>();
  for (const selection of selections) {
    const environment = selection.environment.toUpperCase();
    const services = grouped.get(environment) ?? [];
    if (!services.includes(selection.service)) services.push(selection.service);
    grouped.set(environment, services);
  }
  return [...grouped.entries()].map(([environment, services]) => ({ environment, services }));
}
