import { z } from "zod";
import { fetchAwsContext, type DashboardAwsContext } from "../dashboard/fetch.js";

const AWS_SERVICES = [
  "codecommit", "athena", "s3", "codebuild", "codepipeline",
  "dynamodb", "elasticache", "opensearch", "cloudwatch", "lambda", "kinesis", "sagemaker", "ecs",
] as const;

export const sugoAwsContextInputSchema = {
  environment: z.enum(["default", "dev", "stg", "prd"]).default("default").describe("조회할 AWS 환경. 생략하면 default(team-shared)"),
  services: z.array(z.enum(AWS_SERVICES)).optional().describe("조회할 서비스. 생략하면 전체 서비스 요약"),
  includeResources: z.boolean().default(false).describe("리소스 식별자 포함 여부. 기본 false로 토큰 사용을 제한"),
};

const SugoAwsContextArgs = z.object(sugoAwsContextInputSchema);
type FetchAwsContext = (account: string) => Promise<DashboardAwsContext | null>;

const ENVIRONMENT_ACCOUNTS = {
  default: "default",
  dev: "team-dev",
  stg: "team-stg",
  prd: "team-prd",
} as const;

export async function handleSugoAwsContextWithFetcher(rawArgs: unknown, fetcher: FetchAwsContext) {
  const args = SugoAwsContextArgs.parse(rawArgs ?? {});
  const account = ENVIRONMENT_ACCOUNTS[args.environment];
  const context = await fetcher(account);
  if (!context?.connected) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({
        ok: false,
        errorCode: "AWS_CONTEXT_UNAVAILABLE",
        environment: args.environment,
        account,
        message: "요청한 환경의 Dashboard 연결 또는 AWS Context 스냅샷을 확인하세요.",
      }, null, 2) }],
    };
  }

  const selected = args.services?.length ? new Set(args.services) : null;
  const services = context.inventory
    .filter((item) => !selected || selected.has(item.service as typeof AWS_SERVICES[number]))
    .map((item) => ({
      service: item.service,
      count: item.resources.length,
      status: item.error ? "unavailable" : "ok",
      ...(item.error ? { note: "권한 또는 조회 실패 — Dashboard에서 확인 필요" } : {}),
      ...(args.includeResources ? { resources: item.resources.slice(0, 100) } : {}),
      ...(args.includeResources && item.resources.length > 100 ? { truncated: true } : {}),
    }));

  return {
    content: [{ type: "text" as const, text: JSON.stringify({
      ok: true,
      environment: args.environment,
      connected: context.connected,
      activeAccount: context.activeAccount ?? null,
      accountHint: context.accountHint,
      region: context.region,
      observedAt: context.observedAt,
      stale: !context.observedAt,
      services,
    }, null, 2) }],
  };
}

export async function handleSugoAwsContext(rawArgs: unknown) {
  return handleSugoAwsContextWithFetcher(rawArgs, fetchAwsContext);
}
