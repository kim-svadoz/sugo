import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const awsInventoryServices = [
  "codecommit", "athena", "s3", "codebuild", "codepipeline",
  "dynamodb", "elasticache", "opensearch", "cloudwatch",
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

export function createAwsCliContextClient(customRunner?: AwsRunner): AwsContextClient {
  const run: AwsRunner = customRunner ?? (async (args) => {
    const { stdout } = await execFileAsync("aws", args, { maxBuffer: 8 * 1024 * 1024 });
    return JSON.parse(stdout);
  });

  async function collect(account: AwsContextAccount, service: AwsInventoryService, command: string[], parse: (payload: any) => AwsInventoryResource[]): Promise<AwsServiceInventory> {
    try {
      const payload = await run([...command, ...commonArgs(account)]);
      return { service, resources: parse(payload) };
    } catch (error) {
      return { service, resources: [], error: error instanceof Error ? error.message : String(error) };
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
        collect(account, "codepipeline", ["codepipeline", "list-pipelines"], (p) => compact((p.pipelines ?? []).map((x: any) => resource("codepipeline", "pipeline", x.name, { version: x.version, updated: x.updated })) )),
        collect(account, "dynamodb", ["dynamodb", "list-tables"], (p) => compact((p.TableNames ?? []).map((x: any) => resource("dynamodb", "table", x)) )),
        collect(account, "elasticache", ["elasticache", "describe-replication-groups"], (p) => compact((p.ReplicationGroups ?? []).map((x: any) => resource("elasticache", "replication-group", x.ReplicationGroupId, { status: x.Status, engine: x.Engine })) )),
        collect(account, "opensearch", ["opensearch", "list-domain-names"], (p) => compact((p.DomainNames ?? []).map((x: any) => resource("opensearch", "domain", x.DomainName, { engineType: x.EngineType })) )),
        collect(account, "cloudwatch", ["cloudwatch", "list-dashboards"], (p) => compact((p.DashboardEntries ?? []).map((x: any) => resource("cloudwatch", "dashboard", x.DashboardName, { lastModified: x.LastModified, size: x.Size })) )),
      ]);
    },
  };
}
