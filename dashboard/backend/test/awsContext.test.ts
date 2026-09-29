import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createAwsCliContextClient, type AwsContextClient } from "../src/aws/contextClient.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { createApp } from "../src/index.js";
import { syncUser } from "../src/services/syncService.js";
import { seedUserToken } from "./testAuth.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

describe("AWS context CLI adapter", () => {
  it("normalizes the supported AWS service inventories", async () => {
    const client = createAwsCliContextClient(async (args) => {
      const service = args[0];
      if (service === "sts") return { Account: "123456789012", Arn: "arn:aws:iam::123456789012:user/dev" };
      if (service === "codecommit") return { repositories: [{ repositoryName: "orders-api", repositoryId: "r1" }] };
      if (service === "athena") return { WorkGroups: [{ Name: "primary", State: "ENABLED" }] };
      if (service === "s3api") return { Buckets: [{ Name: "logs" }] };
      if (service === "codebuild") return { projects: ["shop-build"] };
      if (service === "codepipeline") return { pipelines: [{ name: "shop-pipeline", version: 3 }] };
      if (service === "dynamodb") return { TableNames: ["recommendations"] };
      if (service === "elasticache") return { ReplicationGroups: [{ ReplicationGroupId: "shop-cache", Status: "available" }] };
      if (service === "opensearch") return { DomainNames: [{ DomainName: "shop-search", EngineType: "OpenSearch" }] };
      if (service === "cloudwatch") return { DashboardEntries: [{ DashboardName: "shop-dashboard" }] };
      throw new Error(`unexpected ${service}`);
    });
    const inventory = await client.inventory({ profile: "team-account", region: "ap-northeast-2" });
    expect(inventory).toHaveLength(9);
    expect(inventory.flatMap((item) => item.resources.map((resource) => resource.id))).toEqual(expect.arrayContaining([
      "orders-api", "primary", "logs", "shop-build", "shop-pipeline", "recommendations", "shop-cache", "shop-search", "shop-dashboard",
    ]));
  });

  it("keeps one denied service visible without dropping successful services", async () => {
    const client = createAwsCliContextClient(async (args) => {
      if (args[0] === "s3api") throw new Error("AccessDenied");
      return {};
    });
    const inventory = await client.inventory({ profile: "team-account", region: "ap-northeast-2" });
    expect(inventory.find((item) => item.service === "s3")).toMatchObject({ resources: [], error: "AccessDenied" });
    expect(inventory.find((item) => item.service === "dynamodb")).toMatchObject({ resources: [] });
  });
});

describe("/api/aws-context", () => {
  it("verifies identity, snapshots inventory, and returns only a masked account id", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    await syncUser(db, { userId: "u1" });
    const auth = (await seedUserToken(db, "u1")).replace(/^Bearer /, "");
    const fake: AwsContextClient = {
      identity: async () => ({ accountId: "123456789012", arn: "arn:aws:iam::123456789012:user/demo-user" }),
      inventory: async () => [{ service: "codecommit", resources: [{ service: "codecommit", kind: "repository", id: "orders-api" }] }],
    };
    const { app } = await createApp({ db, awsContextClient: fake });

    await request(app).put("/api/aws-context").set("Authorization", `Bearer ${auth}`).send({ profile: "team-account", region: "ap-northeast-2" }).expect(200);
    await request(app).post("/api/aws-context/refresh").set("Authorization", `Bearer ${auth}`).expect(200);
    const result = await request(app).get("/api/aws-context").set("Authorization", `Bearer ${auth}`).expect(200);
    expect(result.body).toMatchObject({ connected: true, profile: "team-account", region: "ap-northeast-2", accountHint: "9012", principal: "demo-user" });
    expect(result.body.inventory[0].resources[0].id).toBe("orders-api");
    expect(JSON.stringify(result.body)).not.toContain("123456789012");
  });
});
