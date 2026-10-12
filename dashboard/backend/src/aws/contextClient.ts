import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const awsInventoryServices = [
  "codecommit", "athena", "s3", "codebuild", "codepipeline",
  "dynamodb", "elasticache", "opensearch", "cloudwatch", "lambda", "kinesis", "sagemaker", "ecs",
] as const;
export type AwsInventoryService = (typeof awsInventoryServices)[number];

export interface AwsContextAccount {
  profile: string;
  region: string;
}

export interface AwsRegistryAccount extends AwsContextAccount { accountId: string; }
export interface AwsRuntimeImage { image: string; imageDigest: string | null; tags: string[]; container: string | null; tagError?: string; }
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
  inventory(account: AwsContextAccount, registries?: AwsRegistryAccount[]): Promise<AwsServiceInventory[]>;
  deploymentImages?(account: AwsContextAccount, cluster: string, service: string, registries?: AwsRegistryAccount[]): Promise<{ runtimeImages: AwsRuntimeImage[]; runtimeError: string | null }>;
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
  "lambda:list-functions", "lambda:list-event-source-mappings", "kinesis:list-streams", "kinesis:describe-stream-summary",
  "sagemaker:list-endpoints", "sagemaker:list-endpoint-configs", "sagemaker:list-models", "sagemaker:list-notebook-instances",
  "ecs:list-clusters", "ecs:list-services", "ecs:describe-services", "ecs:describe-task-sets", "ecs:describe-task-definition", "ecs:list-tasks", "ecs:describe-tasks", "ecr:describe-images",
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

function lambdaFunctionName(value: unknown): string | null {
  const normalized = text(value);
  return normalized?.split(":function:").at(-1)?.split(":")[0] ?? null;
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

  async function collectRuntimeImages(account: AwsContextAccount, cluster: string, service: string, registries: AwsRegistryAccount[] = []) {
    const runtimeImages: AwsRuntimeImage[] = [];
    let runtimeError: string | null = null;
    const digestTags = new Map<string, string[]>();
    try {
      const listed = await run(["ecs", "list-tasks", "--cluster", cluster, "--service-name", service, "--desired-status", "RUNNING", ...commonArgs(account)]) as any;
      const taskArns: string[] = Array.isArray(listed.taskArns) ? listed.taskArns.filter((a: unknown): a is string => typeof a === "string") : [];
      for (const batch of chunks(taskArns, 100)) {
        const tasks = await run(["ecs", "describe-tasks", "--cluster", cluster, "--tasks", ...batch, ...commonArgs(account)]) as any;
        if (tasks.failures?.length) throw new Error("ECS runtime task lookup incomplete");
        for (const task of tasks.tasks ?? []) for (const container of task.containers ?? []) {
          if (task.lastStatus !== "RUNNING" || container.lastStatus !== "RUNNING") continue;
          const image = text(container.image); if (!image) continue;
          const imageDigest = text(container.imageDigest);
          const result: AwsRuntimeImage = { image, imageDigest, tags: [], container: text(container.name) };
          const ecr = /^(\d+)\.dkr\.ecr\.([^/]+)\/(.+?)(?::[^/:]+|@sha256:[a-f0-9]+)$/.exec(image);
          if (ecr && imageDigest) {
            const registry = registries.find(r => r.accountId === ecr[1]);
            const credentials = registry ? { profile: registry.profile, region: ecr[2].replace(/\.amazonaws\.com(?:\.cn)?$/, "") } : account;
            const key = `${credentials.profile}/${ecr[1]}/${ecr[3]}@${imageDigest}`;
            try {
              if (!digestTags.has(key)) {
                const detail = await run(["ecr", "describe-images", "--registry-id", ecr[1], "--repository-name", ecr[3], "--image-ids", `imageDigest=${imageDigest}`, ...commonArgs(credentials)]) as any;
                digestTags.set(key, (detail.imageDetails ?? []).filter((d: any) => d.imageDigest === imageDigest).flatMap((d: any) => Array.isArray(d.imageTags) ? d.imageTags.filter((t: unknown) => typeof t === "string") : []));
              }
              result.tags = digestTags.get(key)!;
            } catch (error) { result.tagError = error instanceof Error ? error.message : String(error); }
          }
          runtimeImages.push(result);
        }
      }
    } catch (error) { runtimeError = error instanceof Error ? error.message : String(error); }
    return { runtimeImages, runtimeError };
  }

  async function collectEcs(account: AwsContextAccount, registries: AwsRegistryAccount[] = []): Promise<AwsServiceInventory> {
    const digestTags = new Map<string, string[]>();
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
              const { runtimeImages, runtimeError } = await collectRuntimeImages(account, clusterArn, service.serviceName, registries);
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
                runtimeImages, runtimeError,
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
          const source = actions.find((action: any) => action.actionTypeId?.category === "Source" && ["CodeCommit", "CodeStarSourceConnection", "GitHub"].includes(action.actionTypeId?.provider));
          const build = actions.find((action: any) => action.actionTypeId?.category === "Build" && action.actionTypeId?.provider === "CodeBuild");
          const buildProject = text(build?.configuration?.ProjectName);
          let latestBuild: any = null;
          let buildHistory: any[] = [];
          if (buildProject) {
            const buildList = await run(["codebuild", "list-builds-for-project", "--project-name", buildProject, ...commonArgs(account)]) as any;
            const ids = Array.isArray(buildList.ids) ? buildList.ids.slice(0, 100).filter((id: unknown): id is string => typeof id === "string") : [];
            if (ids.length > 0) {
              const builds = await run(["codebuild", "batch-get-builds", "--ids", ...ids, ...commonArgs(account)]) as any;
              buildHistory = (builds.builds ?? []).filter((b: any) => b.buildStatus === "SUCCEEDED").map((b: any) => ({ project: buildProject, number: b.buildNumber, commit: text(b.resolvedSourceVersion), at: text(b.endTime), imageUri: text(b.exportedEnvironmentVariables?.find((v: any) => v.name === "IMAGE_URI")?.value), imageDigest: text(b.exportedEnvironmentVariables?.find((v: any) => v.name === "IMAGE_DIGEST")?.value) }));
              latestBuild = (builds.builds ?? []).find((item: any) => item.buildStatus === "SUCCEEDED") ?? builds.builds?.[0] ?? null;
            }
          }
          const pipeline = resource("codepipeline", "pipeline", name, {
            version: detail.pipeline?.version,
            updated: detail.metadata?.updated,
            repositoryName: text(source?.configuration?.RepositoryName) ?? text(source?.configuration?.FullRepositoryId),
            branchName: text(source?.configuration?.BranchName),
            buildProject,
            buildHistory,
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

  async function collectSageMaker(account: AwsContextAccount): Promise<AwsServiceInventory> {
    const resources: AwsInventoryResource[] = [];
    const errors: string[] = [];
    const calls: Array<{ command: string[]; parse: (payload: any) => AwsInventoryResource[] }> = [
      {
        command: ["sagemaker", "list-endpoints", "--max-items", "100"],
        parse: (payload) => compact((payload.Endpoints ?? []).map((item: any) => resource("sagemaker", "endpoint", item.EndpointName, {
          status: item.EndpointStatus,
          creationTime: item.CreationTime,
          lastModifiedTime: item.LastModifiedTime,
        }))),
      },
      {
        command: ["sagemaker", "list-endpoint-configs", "--max-items", "100"],
        parse: (payload) => compact((payload.EndpointConfigs ?? []).map((item: any) => resource("sagemaker", "endpoint-config", item.EndpointConfigName, {
          creationTime: item.CreationTime,
        }))),
      },
      {
        command: ["sagemaker", "list-models", "--max-items", "100"],
        parse: (payload) => compact((payload.Models ?? []).map((item: any) => resource("sagemaker", "model", item.ModelName, {
          creationTime: item.CreationTime,
        }))),
      },
      {
        command: ["sagemaker", "list-notebook-instances", "--max-items", "100"],
        parse: (payload) => compact((payload.NotebookInstances ?? []).map((item: any) => resource("sagemaker", "notebook-instance", item.NotebookInstanceName, {
          status: item.NotebookInstanceStatus,
          instanceType: item.InstanceType,
          creationTime: item.CreationTime,
          lastModifiedTime: item.LastModifiedTime,
        }))),
      },
    ];
    for (const call of calls) {
      try {
        resources.push(...call.parse(await run([...call.command, ...commonArgs(account)])));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    return { service: "sagemaker", resources, ...(errors.length ? { error: errors.join("; ") } : {}) };
  }

  async function collectLambda(account: AwsContextAccount): Promise<AwsServiceInventory> {
    try {
      const [functionsPayload, mappingsPayload] = await Promise.all([
        run(["lambda", "list-functions", "--query", "{Functions: Functions[].{FunctionName:FunctionName,Runtime:Runtime,Handler:Handler,State:State,LastModified:LastModified,MemorySize:MemorySize,Timeout:Timeout,EnvironmentVariableNames:keys(not_null(Environment.Variables, `{}`))}}", ...commonArgs(account)]),
        run(["lambda", "list-event-source-mappings", "--query", "{EventSourceMappings: EventSourceMappings[].{FunctionArn:FunctionArn,EventSourceArn:EventSourceArn,State:State,BatchSize:BatchSize,StartingPosition:StartingPosition}}", ...commonArgs(account)]),
      ]) as any[];
      const mappings = Array.isArray(mappingsPayload.EventSourceMappings) ? mappingsPayload.EventSourceMappings : [];
      const resources = compact((functionsPayload.Functions ?? []).map((fn: any) => {
        const functionName = text(fn.FunctionName);
        const eventSourceMappings = mappings
          .filter((mapping: any) => (text(mapping.FunctionName) ?? lambdaFunctionName(mapping.FunctionArn)) === functionName)
          .map((mapping: any) => ({
            eventSourceArn: text(mapping.EventSourceArn),
            state: text(mapping.State),
            batchSize: typeof mapping.BatchSize === "number" ? mapping.BatchSize : null,
            startingPosition: text(mapping.StartingPosition),
          }));
        return resource("lambda", "function", functionName, {
          runtime: text(fn.Runtime),
          handler: text(fn.Handler),
          state: text(fn.State),
          lastModified: text(fn.LastModified),
          memorySize: typeof fn.MemorySize === "number" ? fn.MemorySize : null,
          timeout: typeof fn.Timeout === "number" ? fn.Timeout : null,
          environmentVariableNames: Array.isArray(fn.EnvironmentVariableNames) ? fn.EnvironmentVariableNames.filter((name: unknown): name is string => typeof name === "string") : [],
          eventSourceMappings,
        });
      }));
      return { service: "lambda", resources };
    } catch (error) {
      return { service: "lambda", resources: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  async function collectKinesis(account: AwsContextAccount): Promise<AwsServiceInventory> {
    const resources: AwsInventoryResource[] = [];
    const errors: string[] = [];
    try {
      const payload = await run(["kinesis", "list-streams", "--limit", "100", "--query", "{StreamSummaries: StreamSummaries[].{StreamName:StreamName,StreamARN:StreamARN,StreamStatus:StreamStatus,StreamModeDetails:StreamModeDetails,StreamCreationTimestamp:StreamCreationTimestamp}}", ...commonArgs(account)]) as any;
      for (const stream of payload.StreamSummaries ?? []) {
        const streamName = text(stream.StreamName);
        if (!streamName) continue;
        let openShardCount: number | null = null;
        try {
          const detail = await run(["kinesis", "describe-stream-summary", "--stream-name", streamName, "--query", "{StreamDescriptionSummary:{OpenShardCount:StreamDescriptionSummary.OpenShardCount}}", ...commonArgs(account)]) as any;
          openShardCount = typeof detail.StreamDescriptionSummary?.OpenShardCount === "number" ? detail.StreamDescriptionSummary.OpenShardCount : null;
        } catch (error) {
          errors.push(`${streamName}: ${error instanceof Error ? error.message : String(error)}`);
        }
        const item = resource("kinesis", "stream", streamName, {
          arn: text(stream.StreamARN),
          status: text(stream.StreamStatus),
          streamMode: text(stream.StreamModeDetails?.StreamMode),
          creationTimestamp: text(stream.StreamCreationTimestamp),
          openShardCount,
        });
        if (item) resources.push(item);
      }
      return { service: "kinesis", resources, ...(errors.length ? { error: errors.join("; ") } : {}) };
    } catch (error) {
      return { service: "kinesis", resources: [], error: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    async identity(account) {
      const payload = await run(["sts", "get-caller-identity", ...commonArgs(account)]) as any;
      if (!text(payload.Account) || !text(payload.Arn)) throw new Error("AWS identity response is incomplete");
      return { accountId: payload.Account, arn: payload.Arn };
    },
    async deploymentImages(account, cluster, service, registries) { return collectRuntimeImages(account, cluster, service, registries); },
    async inventory(account, registries) {
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
        collectLambda(account),
        collectKinesis(account),
        collectSageMaker(account),
        collectEcs(account, registries),
      ]);
    },
  };
}
