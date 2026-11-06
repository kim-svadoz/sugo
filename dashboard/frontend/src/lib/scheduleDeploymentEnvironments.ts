import type { IntegrationSelection } from "../api/projectIntegrationsApi.js";
import type { SpecDeployment } from "./specDeployment.js";

export interface ScheduleDeploymentEnvironment {
  key: string;
  label: string;
  reached: boolean;
}

export function hasLocalCommitEvidence(deployment?: Pick<SpecDeployment, "sources">): boolean {
  return Boolean(deployment?.sources?.some((source) =>
    source.state === "committed"
    && typeof source.commit === "string"
    && /^[a-f0-9]{40,64}$/i.test(source.commit),
  ));
}

export function scheduleDeploymentEnvironments(
  selections: IntegrationSelection[],
  deployment?: SpecDeployment,
): ScheduleDeploymentEnvironment[] {
  const localReached = hasLocalCommitEvidence(deployment);
  const result: ScheduleDeploymentEnvironment[] = [{ key: "local", label: "LOCAL", reached: localReached }];
  const seen = new Set<string>();
  for (const selection of selections) {
    if (seen.has(selection.accountName)) continue;
    seen.add(selection.accountName);
    const evidence = deployment?.environments.find((item) => item.environment === selection.environment);
    result.push({ key: selection.accountName, label: selection.accountName, reached: Boolean(evidence && evidence.included > 0) });
  }
  return result;
}
