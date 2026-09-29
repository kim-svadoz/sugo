import { describe, expect, it } from "vitest";
import { handleSugoAwsContextWithFetcher } from "../src/tools/sugoAwsContext.js";

function parse(result: Awaited<ReturnType<typeof handleSugoAwsContextWithFetcher>>) {
  return JSON.parse(result.content[0].text);
}

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
    ["dev", "team-dev"],
    ["stg", "team-stg"],
    ["prd", "team-prd"],
  ] as const)("%s 환경을 지정하면 %s 계정 snapshot을 요청한다", async (environment, accountName) => {
    let requestedAccount: string | undefined;
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
    });
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

  it("Dashboard를 읽을 수 없으면 거짓 빈 목록 대신 unavailable로 실패한다", async () => {
    const result = await handleSugoAwsContextWithFetcher({}, async () => null);
    expect(result.isError).toBe(true);
    expect(parse(result).errorCode).toBe("AWS_CONTEXT_UNAVAILABLE");
  });
});
