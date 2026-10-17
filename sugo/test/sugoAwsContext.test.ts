import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveAwsEnvironmentAccount } from "../src/dashboard/config.js";
import { handleSugoAwsContextWithFetcher } from "../src/tools/sugoAwsContext.js";

function parse(result: Awaited<ReturnType<typeof handleSugoAwsContextWithFetcher>>) {
  return JSON.parse(result.content[0].text);
}

let home: string;
const originalHome = process.env.SUGO_HOME_OVERRIDE;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "sugo-aws-context-"));
  process.env.SUGO_HOME_OVERRIDE = home;
});

afterEach(async () => {
  if (originalHome === undefined) delete process.env.SUGO_HOME_OVERRIDE;
  else process.env.SUGO_HOME_OVERRIDE = originalHome;
  await rm(home, { recursive: true, force: true });
});

describe("resolveAwsEnvironmentAccount", () => {
  it("설정이 없으면 환경 이름을 계정 표시 이름으로 그대로 쓴다", async () => {
    expect(await resolveAwsEnvironmentAccount("dev")).toBe("dev");
  });

  it("settings.json의 aws.environments에 등록한 별칭만 계정 이름으로 바꾼다", async () => {
    await mkdir(join(home, ".claude", "sugo"), { recursive: true });
    await writeFile(join(home, ".claude", "sugo", "settings.json"), JSON.stringify({ aws: { environments: { dev: "team-dev" } } }));
    expect(await resolveAwsEnvironmentAccount("dev")).toBe("team-dev");
    expect(await resolveAwsEnvironmentAccount("prd")).toBe("prd");
  });
});

describe("sugo_aws_context", () => {
  it("기본 응답은 리소스 이름을 싣지 않고 서비스별 개수만 보여준다", async () => {
    let requestedAccount: string | undefined;
    const result = await handleSugoAwsContextWithFetcher({}, async (account) => {
      requestedAccount = account;
      return {
        connected: true,
        activeAccount: "default",
        profile: "team-account",
        region: "ap-northeast-2",
        accountHint: "9012",
        principal: "developer",
        observedAt: "2026-09-29T00:00:00.000Z",
        inventory: [{ service: "s3", resources: [{ kind: "bucket", id: "private-name" }] }],
      };
    });
    expect(requestedAccount).toBe("default");
    expect(parse(result)).toMatchObject({ ok: true, accountHint: "9012", services: [{ service: "s3", count: 1, status: "ok" }] });
    expect(result.content[0].text).not.toContain("private-name");
  });

  it.each([
    ["dev", { dev: "team-dev" }, "team-dev"],
    ["prd", { dev: "team-dev" }, "prd"],
    ["sandbox", {}, "sandbox"],
  ] as const)("%s 환경은 사용자 별칭이 있으면 그 계정, 없으면 같은 이름의 계정 snapshot을 요청한다", async (environment, aliases, accountName) => {
    let requestedAccount: string | undefined;
    const resolveAccount = async (env: string) => (aliases as Record<string, string>)[env] ?? env;
    const result = await handleSugoAwsContextWithFetcher({ environment }, async (account) => {
      requestedAccount = account;
      return {
        connected: true,
        activeAccount: accountName,
        profile: accountName,
        region: "ap-northeast-2",
        accountHint: "1234",
        principal: "developer",
        observedAt: "2026-09-29T00:00:00.000Z",
        inventory: [],
      };
    }, resolveAccount);
    expect(requestedAccount).toBe(accountName);
    expect(parse(result)).toMatchObject({ ok: true, environment, activeAccount: accountName });
  });

  it("요청한 서비스만 리소스를 최대 100개까지 반환한다", async () => {
    const result = await handleSugoAwsContextWithFetcher({ services: ["codecommit"], includeResources: true }, async () => ({
      connected: true,
      profile: "team-account",
      region: "ap-northeast-2",
      accountHint: "9012",
      principal: "developer",
      observedAt: "2026-09-29T00:00:00.000Z",
      inventory: [
        { service: "codecommit", resources: Array.from({ length: 101 }, (_, i) => ({ kind: "repository", id: `repo-${i}` })) },
        { service: "s3", resources: [{ kind: "bucket", id: "bucket" }] },
      ],
    }));
    const payload = parse(result);
    expect(payload.services).toHaveLength(1);
    expect(payload.services[0].resources).toHaveLength(100);
    expect(payload.services[0].truncated).toBe(true);
  });

  it("SageMaker snapshot을 명시적으로 조회할 수 있다", async () => {
    const result = await handleSugoAwsContextWithFetcher({ services: ["sagemaker"], includeResources: true }, async () => ({
      connected: true,
      profile: "team-account",
      region: "ap-northeast-2",
      accountHint: "9012",
      principal: "developer",
      observedAt: "2026-09-30T00:00:00.000Z",
      inventory: [{ service: "sagemaker", resources: [{ kind: "endpoint", id: "sample-ranker", metadata: { status: "InService" } }] }],
    }));
    expect(parse(result).services).toEqual([{ service: "sagemaker", count: 1, status: "ok", resources: [{ kind: "endpoint", id: "sample-ranker", metadata: { status: "InService" } }] }]);
  });

  it.each(["lambda", "kinesis"] as const)("%s snapshot을 명시적으로 조회할 수 있다", async (service) => {
    const result = await handleSugoAwsContextWithFetcher({ services: [service], includeResources: true }, async () => ({
      connected: true,
      profile: "team-account",
      region: "ap-northeast-2",
      accountHint: "9012",
      principal: "developer",
      observedAt: "2026-10-12T00:00:00.000Z",
      inventory: [{ service, resources: [{ kind: service === "lambda" ? "function" : "stream", id: `sample-${service}` }] }],
    }));
    expect(parse(result).services[0]).toMatchObject({ service, count: 1, resources: [{ id: `sample-${service}` }] });
  });

  it("Dashboard를 읽을 수 없으면 거짓 빈 목록 대신 unavailable로 실패한다", async () => {
    const result = await handleSugoAwsContextWithFetcher({}, async () => null);
    expect(result.isError).toBe(true);
    expect(parse(result).errorCode).toBe("AWS_CONTEXT_UNAVAILABLE");
  });
});
