import { basename } from "node:path";

interface InventoryResource {
  kind: string;
  id: string;
  metadata?: Record<string, unknown>;
}

interface InventoryService {
  error?: string;
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
  linkMode: "suggested" | "confirmed";
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
  apmSampleCount: number | null;
  apmErrorCount: number | null;
  apmErrorRate: number | null;
  apmAverageResponseMs: number | null;
  apmP95ResponseMs: number | null;
  apmMaxResponseMs: number | null;
  apmApdexScore: number | null;
  apmSignal: PinpointApplicationSnapshot["signal"] | null;
}

export interface PinpointApplicationSnapshot { applicationName: string; agentCount: number; runningAgentCount: number; latestHeartbeatAt: string | null; state: "OBSERVED" | "STALE" | "MISSING" | "UNKNOWN"; sampleCount?: number; successCount?: number; errorCount?: number; errorRate?: number | null; averageResponseMs?: number | null; p95ResponseMs?: number | null; maxResponseMs?: number | null; apdexScore?: number | null; signal?: "TRAFFIC_OK" | "ERRORS_OBSERVED" | "NO_TRAFFIC" | "UNAVAILABLE"; }
export interface ProjectIntegrationSelection { accountName: string; service: string; environment: string; cluster?: string | null; }

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

function linkExactService(targetName: string, snapshots: AwsDeploymentSnapshot[], pinpoint: PinpointApplicationSnapshot[], selections?: ProjectIntegrationSelection[]): AwsProjectDeployment[] {
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
      const resourceCluster = stringValue(metadata.cluster);
      const selection = selections?.find((item) => item.accountName === snapshot.accountName && item.service === resource.id && (!item.cluster || item.cluster === resourceCluster));
      if (selections ? !selection : !imageMatches && normalizedService !== normalizedTarget) continue;
      const status = stringValue(metadata.status);
      const rolloutState = stringValue(metadata.rolloutState);
      const runningCount = numberValue(metadata.runningCount);
      const desiredCount = numberValue(metadata.desiredCount);
      const pinpointApplicationName = stringValue(metadata.pinpointApplicationName);
      const apm = pinpointApplicationName ? pinpoint.find((item) => item.applicationName === pinpointApplicationName) : undefined;
      deployments.push({
        linkMode: selections ? "confirmed" : "suggested",
        matchSource: imageMatches ? "image" : "service",
        accountName: snapshot.accountName,
        environment: selection?.environment ?? environmentOf(snapshot.accountName),
        region: snapshot.region,
        cluster: resourceCluster,
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
        apmSampleCount: apm?.sampleCount ?? null,
        apmErrorCount: apm?.errorCount ?? null,
        apmErrorRate: apm?.errorRate ?? null,
        apmAverageResponseMs: apm?.averageResponseMs ?? null,
        apmP95ResponseMs: apm?.p95ResponseMs ?? null,
        apmMaxResponseMs: apm?.maxResponseMs ?? null,
        apmApdexScore: apm?.apdexScore ?? null,
        apmSignal: apm?.signal ?? null,
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
export function linkAwsDeployments(projectPath: string, snapshots: AwsDeploymentSnapshot[], pinpoint: PinpointApplicationSnapshot[] = [], selections?: ProjectIntegrationSelection[]): AwsProjectDeployment[] {
  return linkExactService(basename(projectPath), snapshots, pinpoint, selections);
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
