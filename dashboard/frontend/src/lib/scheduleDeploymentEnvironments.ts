import type { IntegrationSelection } from "../api/projectIntegrationsApi.js";
import type { SpecDeployment } from "./specDeployment.js";

export interface ScheduleDeploymentEnvironment {
  key: string;
  label: string;
  reached: boolean;
}

export function scheduleDeploymentEnvironments(
  selections: IntegrationSelection[],
  deployment?: SpecDeployment,
): ScheduleDeploymentEnvironment[] {
  const localReached = Boolean(deployment && deployment.environment !== "UNKNOWN");
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
