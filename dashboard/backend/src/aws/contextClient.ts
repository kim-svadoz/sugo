import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const awsInventoryServices = [
  "codecommit", "athena", "s3", "codebuild", "codepipeline",
  "dynamodb", "elasticache", "opensearch", "cloudwatch", "ecs",
] as const;
export type AwsInventoryService = (typeof awsInventoryServices)[number];

export interface AwsContextAccount {
  profile: string;
  region: string;
}

export interface AwsIdentity {
  accountId: string;
  arn: string;
}

export interface AwsInventoryResource {
  service: AwsInventoryService;
  kind: string;
  id: string;
  metadata?: Record<string, unknown>;
}

export interface AwsServiceInventory {
  service: AwsInventoryService;
  resources: AwsInventoryResource[];
  error?: string;
}

export interface AwsContextClient {
  identity(account: AwsContextAccount): Promise<AwsIdentity>;
  inventory(account: AwsContextAccount): Promise<AwsServiceInventory[]>;
}

type AwsRunner = (args: string[]) => Promise<unknown>;

const READ_ONLY_AWS_OPERATIONS = new Set([
  "sts:get-caller-identity",
  "codecommit:list-repositories",
  "athena:list-work-groups",
  "s3api:list-buckets",
  "codebuild:list-projects", "codebuild:list-builds-for-project", "codebuild:batch-get-builds",
  "codepipeline:list-pipelines", "codepipeline:get-pipeline",
  "dynamodb:list-tables", "elasticache:describe-replication-groups",
  "opensearch:list-domain-names", "cloudwatch:list-dashboards",
  "ecs:list-clusters", "ecs:list-services", "ecs:describe-services", "ecs:describe-task-sets", "ecs:describe-task-definition",
]);

/** Dashboard AWS boundary: explicit allowlist, deny by default. Prefix heuristics are intentionally forbidden. */
export function assertReadOnlyAwsArgs(args: string[]): void {
  const key = `${args[0] ?? ""}:${args[1] ?? ""}`;
  if (!READ_ONLY_AWS_OPERATIONS.has(key)) {
    throw Object.assign(new Error(`AWS_READ_ONLY_POLICY_DENIED: ${key || "missing operation"}`), { code: "AWS_READ_ONLY_POLICY_DENIED" });
  }
}

function commonArgs(account: AwsContextAccount): string[] {
  return ["--profile", account.profile, "--region", account.region, "--output", "json", "--no-cli-pager"];
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function resource(service: AwsInventoryService, kind: string, id: unknown, metadata?: Record<string, unknown>): AwsInventoryResource | null {
  const normalized = text(id);
  return normalized ? { service, kind, id: normalized, ...(metadata ? { metadata } : {}) } : null;
}

function compact(items: Array<AwsInventoryResource | null>): AwsInventoryResource[] {
  return items.filter((item): item is AwsInventoryResource => item !== null);
}

function arnName(value: unknown): string | null {
  const normalized = text(value);
  return normalized?.split("/").at(-1) ?? null;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
}

export function createAwsCliContextClient(customRunner?: AwsRunner): AwsContextClient {
  const underlying: AwsRunner = customRunner ?? (async (args) => {
    const { stdout } = await execFileAsync("aws", args, { maxBuffer: 8 * 1024 * 1024, timeout: 60_000 });
    return JSON.parse(stdout);
  });
  const run: AwsRunner = async (args) => { assertReadOnlyAwsArgs(args); return underlying(args); };

  async function collect(account: AwsContextAccount, service: AwsInventoryService, command: string[], parse: (payload: any) => AwsInventoryResource[]): Promise<AwsServiceInventory> {
    try {
      const payload = await run([...command, ...commonArgs(account)]);
      return { service, resources: parse(payload) };
    } catch (error) {
      return { service, resources: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  async function collectEcs(account: AwsContextAccount): Promise<AwsServiceInventory> {
    const resources: AwsInventoryResource[] = [];
    const errors: string[] = [];
    try {
      const clusterPayload = await run(["ecs", "list-clusters", ...commonArgs(account)]) as any;
      const clusterArns = Array.isArray(clusterPayload.clusterArns) ? clusterPayload.clusterArns : [];
      resources.push(...compact(clusterArns.map((arn: unknown) => resource("ecs", "cluster", arnName(arn)))));
      for (const clusterArn of clusterArns.filter((arn: unknown): arn is string => typeof arn === "string")) {
        try {
          const servicesPayload = await run(["ecs", "list-services", "--cluster", clusterArn, ...commonArgs(account)]) as any;
          const serviceArns = Array.isArray(servicesPayload.serviceArns) ? servicesPayload.serviceArns.filter((arn: unknown): arn is string => typeof arn === "string") : [];
          for (const serviceChunk of chunks(serviceArns, 10)) {
            const described = await run(["ecs", "describe-services", "--cluster", clusterArn, "--services", ...serviceChunk, ...commonArgs(account)]) as any;
            for (const service of described.services ?? []) {
              const primaryDeployment = Array.isArray(service.deployments) ? service.deployments.find((deployment: any) => deployment.status === "PRIMARY") : null;
              let primaryTaskSet: any = null;
              if (service.deploymentController?.type === "CODE_DEPLOY" || !primaryDeployment) {
                try {
                  const payload = await run(["ecs", "describe-task-sets", "--cluster", clusterArn, "--service", service.serviceArn ?? service.serviceName, ...commonArgs(account)]) as any;
                  primaryTaskSet = Array.isArray(payload.taskSets) ? payload.taskSets.find((taskSet: any) => taskSet.status === "PRIMARY") : null;
                } catch (error) {
                  const message = error instanceof Error ? error.message : String(error);
                  if (!message.includes("TaskSets cannot be empty")) errors.push(message);
                }
              }
              const taskDefinitionArn = text(primaryTaskSet?.taskDefinition) ?? text(service.taskDefinition);
              let taskDefinition: any = null;
              if (taskDefinitionArn) {
                try {
                  const payload = await run(["ecs", "describe-task-definition", "--task-definition", taskDefinitionArn, ...commonArgs(account)]) as any;
                  taskDefinition = payload.taskDefinition ?? null;
                } catch (error) {
                  errors.push(error instanceof Error ? error.message : String(error));
                }
              }
              const revision = typeof taskDefinition?.revision === "number"
                ? taskDefinition.revision
                : Number(taskDefinitionArn?.split(":").at(-1)) || null;
              const family = text(taskDefinition?.family) ?? taskDefinitionArn?.split("/").at(-1)?.split(":")[0] ?? null;
              const images = Array.isArray(taskDefinition?.containerDefinitions)
                ? taskDefinition.containerDefinitions.map((container: any) => text(container.image)).filter((image: string | null): image is string => image !== null)
                : [];
              const pinpointApplicationNames = Array.isArray(taskDefinition?.containerDefinitions)
                ? taskDefinition.containerDefinitions.flatMap((container: any) => {
                    const fromEnv = Array.isArray(container.environment)
                      ? container.environment.filter((item: any) => item?.name === "PINPOINT_APPLICATION_NAME").map((item: any) => text(item.value))
                      : [];
                    const commandText = [...(container.entryPoint ?? []), ...(container.command ?? [])].join(" ");
                    const fromCommand = [...commandText.matchAll(/-Dpinpoint\.applicationName=([^\s"']+)/g)].map((match) => match[1]);
                    return [...fromEnv, ...fromCommand].filter((value): value is string => value !== null);
                  })
                : [];
              const serviceResource = resource("ecs", "service", service.serviceName ?? arnName(service.serviceArn), {
                cluster: arnName(clusterArn),
                status: service.status,
                desiredCount: service.desiredCount,
                runningCount: service.runningCount,
                rolloutState: primaryDeployment?.rolloutState ?? primaryTaskSet?.stabilityStatus ?? null,
                deployedAt: text(primaryDeployment?.updatedAt) ?? text(primaryDeployment?.createdAt) ?? text(primaryTaskSet?.updatedAt) ?? text(primaryTaskSet?.createdAt),
                deploymentSource: primaryTaskSet ? "ECS_TASK_SET" : primaryDeployment ? "ECS_DEPLOYMENT" : null,
                taskDefinition: family && revision ? `${family}:${revision}` : taskDefinitionArn,
                revision,
                images,
                pinpointApplicationName: pinpointApplicationNames[0] ?? null,
                taskDefinitionRegisteredAt: text(taskDefinition?.registeredAt),
              });
              if (serviceResource) resources.push(serviceResource);
            }
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
      return { service: "ecs", resources, ...(errors.length ? { error: errors.join("; ") } : {}) };
    } catch (error) {
      return { service: "ecs", resources: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  async function collectCodePipelines(account: AwsContextAccount): Promise<AwsServiceInventory> {
    const resources: AwsInventoryResource[] = [];
    const errors: string[] = [];
    try {
      const listed = await run(["codepipeline", "list-pipelines", ...commonArgs(account)]) as any;
      const names = (listed.pipelines ?? []).map((item: any) => text(item.name)).filter((name: string | null): name is string => name !== null);
      for (const name of names) {
        try {
          const detail = await run(["codepipeline", "get-pipeline", "--name", name, ...commonArgs(account)]) as any;
          const stages = Array.isArray(detail.pipeline?.stages) ? detail.pipeline.stages : [];
          const actions = stages.flatMap((stage: any) => Array.isArray(stage.actions) ? stage.actions : []);
          const source = actions.find((action: any) => action.actionTypeId?.category === "Source" && action.actionTypeId?.provider === "CodeCommit");
          const build = actions.find((action: any) => action.actionTypeId?.category === "Build" && action.actionTypeId?.provider === "CodeBuild");
          const buildProject = text(build?.configuration?.ProjectName);
          let latestBuild: any = null;
          if (buildProject) {
            const buildList = await run(["codebuild", "list-builds-for-project", "--project-name", buildProject, ...commonArgs(account)]) as any;
            const ids = Array.isArray(buildList.ids) ? buildList.ids.slice(0, 10).filter((id: unknown): id is string => typeof id === "string") : [];
            if (ids.length > 0) {
              const builds = await run(["codebuild", "batch-get-builds", "--ids", ...ids, ...commonArgs(account)]) as any;
              latestBuild = (builds.builds ?? []).find((item: any) => item.buildStatus === "SUCCEEDED") ?? builds.builds?.[0] ?? null;
            }
          }
          const pipeline = resource("codepipeline", "pipeline", name, {
            version: detail.pipeline?.version,
            updated: detail.metadata?.updated,
            repositoryName: text(source?.configuration?.RepositoryName),
            branchName: text(source?.configuration?.BranchName),
            buildProject,
            latestBuildNumber: typeof latestBuild?.buildNumber === "number" ? latestBuild.buildNumber : null,
            latestBuildCommit: text(latestBuild?.resolvedSourceVersion),
            latestBuildStatus: text(latestBuild?.buildStatus),
            latestBuildAt: text(latestBuild?.endTime) ?? text(latestBuild?.startTime),
          });
          if (pipeline) resources.push(pipeline);
        } catch (error) {
          errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
          const fallback = resource("codepipeline", "pipeline", name);
          if (fallback) resources.push(fallback);
        }
      }
      return { service: "codepipeline", resources, ...(errors.length ? { error: errors.join("; ") } : {}) };
    } catch (error) {
      return { service: "codepipeline", resources: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    async identity(account) {
      const payload = await run(["sts", "get-caller-identity", ...commonArgs(account)]) as any;
      if (!text(payload.Account) || !text(payload.Arn)) throw new Error("AWS identity response is incomplete");
      return { accountId: payload.Account, arn: payload.Arn };
    },
    async inventory(account) {
      return Promise.all([
        collect(account, "codecommit", ["codecommit", "list-repositories"], (p) => compact((p.repositories ?? []).map((x: any) => resource("codecommit", "repository", x.repositoryName, { repositoryId: x.repositoryId })) )),
        collect(account, "athena", ["athena", "list-work-groups"], (p) => compact((p.WorkGroups ?? []).map((x: any) => resource("athena", "workgroup", x.Name, { state: x.State })) )),
        collect(account, "s3", ["s3api", "list-buckets"], (p) => compact((p.Buckets ?? []).map((x: any) => resource("s3", "bucket", x.Name, { creationDate: x.CreationDate })) )),
        collect(account, "codebuild", ["codebuild", "list-projects", "--sort-by", "NAME"], (p) => compact((p.projects ?? []).map((x: any) => resource("codebuild", "project", x)) )),
        collectCodePipelines(account),
        collect(account, "dynamodb", ["dynamodb", "list-tables"], (p) => compact((p.TableNames ?? []).map((x: any) => resource("dynamodb", "table", x)) )),
        collect(account, "elasticache", ["elasticache", "describe-replication-groups"], (p) => compact((p.ReplicationGroups ?? []).map((x: any) => resource("elasticache", "replication-group", x.ReplicationGroupId, { status: x.Status, engine: x.Engine })) )),
        collect(account, "opensearch", ["opensearch", "list-domain-names"], (p) => compact((p.DomainNames ?? []).map((x: any) => resource("opensearch", "domain", x.DomainName, { engineType: x.EngineType })) )),
        collect(account, "cloudwatch", ["cloudwatch", "list-dashboards"], (p) => compact((p.DashboardEntries ?? []).map((x: any) => resource("cloudwatch", "dashboard", x.DashboardName, { lastModified: x.LastModified, size: x.Size })) )),
        collectEcs(account),
      ]);
    },
  };
}
