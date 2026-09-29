import { basename } from "node:path";

interface InventoryResource {
  kind: string;
  id: string;
  metadata?: Record<string, unknown>;
}

interface InventoryService {
  service: string;
  resources: InventoryResource[];
}

export interface AwsDeploymentSnapshot {
  accountName: string;
  region: string;
  observedAt: string | null;
  inventory: InventoryService[];
}

export interface AwsProjectDeployment {
  matchSource: "image" | "service";
  accountName: string;
  environment: string;
  region: string;
  cluster: string | null;
  service: string;
  status: string | null;
  rolloutState: string | null;
  healthState: "HEALTHY" | "DEPLOYING" | "DEGRADED" | "INACTIVE" | "UNKNOWN";
  taskDefinition: string | null;
  revision: number | null;
  runningCount: number | null;
  desiredCount: number | null;
  images: string[];
  deployedAt: string | null;
  taskDefinitionRegisteredAt: string | null;
  observedAt: string | null;
  pinpointApplicationName: string | null;
  apmState: "OBSERVED" | "STALE" | "MISSING" | "UNKNOWN" | null;
  apmRunningAgents: number | null;
  apmAgentCount: number | null;
  apmLatestHeartbeatAt: string | null;
}

export interface PinpointApplicationSnapshot { applicationName: string; agentCount: number; runningAgentCount: number; latestHeartbeatAt: string | null; state: "OBSERVED" | "STALE" | "MISSING" | "UNKNOWN"; }

export interface AwsProjectRelease {
  pipeline: string;
  baseBranch: string;
  buildProject: string | null;
  latestBuildNumber: number | null;
  latestBuildCommit: string | null;
  latestBuildStatus: string | null;
  latestBuildAt: string | null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function environmentOf(accountName: string): string {
  return accountName.endsWith("-env") ? accountName.slice(0, -"-env".length) : accountName;
}

function healthStateOf(status: string | null, rolloutState: string | null, running: number | null, desired: number | null): AwsProjectDeployment["healthState"] {
  if (status && status !== "ACTIVE") return "INACTIVE";
  if (rolloutState === "FAILED") return "DEGRADED";
  if (running !== null && desired !== null && running < desired) {
    return rolloutState === "IN_PROGRESS" ? "DEPLOYING" : "DEGRADED";
  }
  if (rolloutState === "IN_PROGRESS") return "DEPLOYING";
  if (running !== null && desired !== null && running === desired) return "HEALTHY";
  return "UNKNOWN";
}

function imageRepositoryName(image: string): string {
  const lastSegment = image.split("/").at(-1) ?? image;
  return lastSegment.split("@")[0].split(":")[0].toLowerCase();
}

function linkExactService(targetName: string, snapshots: AwsDeploymentSnapshot[], pinpoint: PinpointApplicationSnapshot[]): AwsProjectDeployment[] {
  const normalizedTarget = targetName.toLowerCase();
  const deployments: AwsProjectDeployment[] = [];
  for (const snapshot of snapshots) {
    const ecs = snapshot.inventory.find((item) => item.service === "ecs");
    for (const resource of ecs?.resources ?? []) {
      if (resource.kind !== "service") continue;
      const normalizedService = resource.id.toLowerCase().replace(/-service$/, "");
      const metadata = resource.metadata ?? {};
      const images = Array.isArray(metadata.images) ? metadata.images.filter((item): item is string => typeof item === "string") : [];
      const imageMatches = images.some((image) => imageRepositoryName(image) === normalizedTarget);
      if (!imageMatches && normalizedService !== normalizedTarget) continue;
      const status = stringValue(metadata.status);
      const rolloutState = stringValue(metadata.rolloutState);
      const runningCount = numberValue(metadata.runningCount);
      const desiredCount = numberValue(metadata.desiredCount);
      const pinpointApplicationName = stringValue(metadata.pinpointApplicationName);
      const apm = pinpointApplicationName ? pinpoint.find((item) => item.applicationName === pinpointApplicationName) : undefined;
      deployments.push({
        matchSource: imageMatches ? "image" : "service",
        accountName: snapshot.accountName,
        environment: environmentOf(snapshot.accountName),
        region: snapshot.region,
        cluster: stringValue(metadata.cluster),
        service: resource.id,
        status,
        rolloutState,
        healthState: healthStateOf(status, rolloutState, runningCount, desiredCount),
        taskDefinition: stringValue(metadata.taskDefinition),
        revision: numberValue(metadata.revision),
        runningCount,
        desiredCount,
        images,
        deployedAt: stringValue(metadata.deployedAt),
        taskDefinitionRegisteredAt: stringValue(metadata.taskDefinitionRegisteredAt),
        observedAt: snapshot.observedAt,
        pinpointApplicationName,
        apmState: apm?.state ?? null,
        apmRunningAgents: apm?.runningAgentCount ?? null,
        apmAgentCount: apm?.agentCount ?? null,
        apmLatestHeartbeatAt: apm?.latestHeartbeatAt ?? null,
      });
    }
  }
  const environmentOrder = new Map([["dev", 0], ["stg", 1], ["prd", 2]]);
  return deployments.sort((a, b) =>
    (environmentOrder.get(a.environment) ?? 99) - (environmentOrder.get(b.environment) ?? 99)
    || a.environment.localeCompare(b.environment)
    || a.service.localeCompare(b.service),
  );
}

/** 이름 유사도 추측은 금지한다. repo basename과 ECS service의 `-service` 제거값이 정확히 같을 때만 연결한다. */
export function linkAwsDeployments(projectPath: string, snapshots: AwsDeploymentSnapshot[], pinpoint: PinpointApplicationSnapshot[] = []): AwsProjectDeployment[] {
  return linkExactService(basename(projectPath), snapshots, pinpoint);
}

export function linkAwsRelease(projectPath: string, snapshots: AwsDeploymentSnapshot[]): AwsProjectRelease | null {
  const projectName = basename(projectPath).toLowerCase();
  for (const snapshot of snapshots) {
    const pipelines = snapshot.inventory.find((item) => item.service === "codepipeline");
    for (const resource of pipelines?.resources ?? []) {
      if (resource.kind !== "pipeline") continue;
      const metadata = resource.metadata ?? {};
      if (stringValue(metadata.repositoryName)?.toLowerCase() !== projectName) continue;
      const baseBranch = stringValue(metadata.branchName);
      if (!baseBranch) continue;
      return {
        pipeline: resource.id,
        baseBranch,
        buildProject: stringValue(metadata.buildProject),
        latestBuildNumber: numberValue(metadata.latestBuildNumber),
        latestBuildCommit: stringValue(metadata.latestBuildCommit),
        latestBuildStatus: stringValue(metadata.latestBuildStatus),
        latestBuildAt: stringValue(metadata.latestBuildAt),
      };
    }
  }
  return null;
}
