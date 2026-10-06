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
      if (service === "codebuild" && args[1] === "list-projects") return { projects: ["shop-build"] };
      if (service === "codebuild" && args[1] === "list-builds-for-project") return { ids: ["shop-build:b1"] };
      if (service === "codebuild" && args[1] === "batch-get-builds") return { builds: [{ buildNumber: 421, buildStatus: "SUCCEEDED", resolvedSourceVersion: "abc123", endTime: "2026-09-29T08:29:01.000Z" }] };
      if (service === "codepipeline" && args[1] === "list-pipelines") return { pipelines: [{ name: "shop-pipeline", version: 3 }] };
      if (service === "codepipeline" && args[1] === "get-pipeline") return { pipeline: { version: 3, stages: [{ actions: [{ actionTypeId: { category: "Source", provider: "CodeCommit" }, configuration: { RepositoryName: "orders-api", BranchName: "development" } }] }, { actions: [{ actionTypeId: { category: "Build", provider: "CodeBuild" }, configuration: { ProjectName: "shop-build" } }] }] } };
      if (service === "dynamodb") return { TableNames: ["recommendations"] };
      if (service === "elasticache") return { ReplicationGroups: [{ ReplicationGroupId: "shop-cache", Status: "available" }] };
      if (service === "opensearch") return { DomainNames: [{ DomainName: "shop-search", EngineType: "OpenSearch" }] };
      if (service === "cloudwatch") return { DashboardEntries: [{ DashboardName: "shop-dashboard" }] };
      if (service === "sagemaker" && args[1] === "list-endpoints") return { Endpoints: [{ EndpointName: "shop-ranker", EndpointStatus: "InService", CreationTime: "2026-09-01T00:00:00Z", LastModifiedTime: "2026-09-29T00:00:00Z" }] };
      if (service === "sagemaker" && args[1] === "list-endpoint-configs") return { EndpointConfigs: [{ EndpointConfigName: "shop-ranker-config", CreationTime: "2026-09-01T00:00:00Z" }] };
      if (service === "sagemaker" && args[1] === "list-models") return { Models: [{ ModelName: "shop-model", CreationTime: "2026-09-01T00:00:00Z" }] };
      if (service === "sagemaker" && args[1] === "list-notebook-instances") return { NotebookInstances: [{ NotebookInstanceName: "shop-analysis", NotebookInstanceStatus: "Stopped", InstanceType: "ml.t3.medium", CreationTime: "2026-09-01T00:00:00Z", LastModifiedTime: "2026-09-29T00:00:00Z" }] };
      if (service === "ecs" && args[1] === "list-tasks") return { taskArns: ["task1", "task2"] };
      if (service === "ecs" && args[1] === "describe-tasks") return { tasks: [1, 2].map(() => ({ lastStatus: "RUNNING", containers: [{ lastStatus: "RUNNING", name: "app", image: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/orders-api:421", imageDigest: "sha256:abc" }] })) };
      if (service === "ecr" && args[1] === "describe-images") return { imageDetails: [{ imageDigest: "sha256:abc", imageTags: ["421"] }] };
      if (service === "ecs" && args[1] === "list-clusters") return { clusterArns: ["arn:aws:ecs:ap-northeast-2:123456789012:cluster/shop-cluster"] };
      if (service === "ecs" && args[1] === "list-services") return { serviceArns: ["arn:aws:ecs:ap-northeast-2:123456789012:service/shop-cluster/orders-api-service"] };
      if (service === "ecs" && args[1] === "describe-services") return { services: [{ serviceName: "orders-api-service", status: "ACTIVE", desiredCount: 2, runningCount: 2, taskDefinition: "arn:aws:ecs:ap-northeast-2:123456789012:task-definition/orders-api:343", deployments: [{ status: "PRIMARY", rolloutState: "COMPLETED", createdAt: "2026-09-28T08:00:00.000Z", updatedAt: "2026-09-28T08:03:00.000Z" }] }] };
      if (service === "ecs" && args[1] === "describe-task-definition") return { taskDefinition: { family: "orders-api", revision: 343, containerDefinitions: [{ image: "123.dkr.ecr/orders-api:343" }] } };
      throw new Error(`unexpected ${service}`);
    });
    const inventory = await client.inventory({ profile: "team-account", region: "ap-northeast-2" });
    expect(inventory).toHaveLength(11);
    expect(inventory.find(i => i.service === "ecs")?.resources.find(r => r.kind === "service")?.metadata?.runtimeImages).toEqual([1, 2].map(() => ({ image: "123456789012.dkr.ecr.ap-northeast-2.amazonaws.com/orders-api:421", imageDigest: "sha256:abc", tags: ["421"], container: "app" })));
    expect(inventory.find(i => i.service === "codepipeline")?.resources[0].metadata?.buildHistory).toEqual([expect.objectContaining({ number: 421, commit: "abc123" })]);
    expect(inventory.flatMap((item) => item.resources.map((resource) => resource.id))).toEqual(expect.arrayContaining([
      "orders-api", "primary", "logs", "shop-build", "shop-pipeline", "recommendations", "shop-cache", "shop-search", "shop-dashboard", "shop-ranker", "shop-ranker-config", "shop-model", "shop-analysis", "shop-cluster", "orders-api-service",
    ]));
    expect(inventory.find((item) => item.service === "sagemaker")?.resources).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "endpoint", id: "shop-ranker", metadata: expect.objectContaining({ status: "InService" }) }),
      expect.objectContaining({ kind: "endpoint-config", id: "shop-ranker-config" }),
      expect.objectContaining({ kind: "model", id: "shop-model" }),
      expect.objectContaining({ kind: "notebook-instance", id: "shop-analysis", metadata: expect.objectContaining({ status: "Stopped" }) }),
    ]));
    expect(inventory.find((item) => item.service === "ecs")?.resources.find((item) => item.kind === "service")?.metadata).toMatchObject({ revision: 343, rolloutState: "COMPLETED", runningCount: 2, desiredCount: 2, deployedAt: "2026-09-28T08:03:00.000Z" });
    expect(inventory.find((item) => item.service === "codepipeline")?.resources[0]?.metadata).toMatchObject({ repositoryName: "orders-api", branchName: "development", latestBuildNumber: 421, latestBuildCommit: "abc123" });
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

  it("uses the PRIMARY task set for CodeDeploy ECS services", async () => {
    const client = createAwsCliContextClient(async (args) => {
      if (args[0] !== "ecs") return {};
      if (args[1] === "list-clusters") return { clusterArns: ["arn:aws:ecs:ap-northeast-2:123:cluster/shop"] };
      if (args[1] === "list-services") return { serviceArns: ["arn:aws:ecs:ap-northeast-2:123:service/shop/orders-service"] };
      if (args[1] === "describe-services") return { services: [{ serviceName: "orders-service", status: "ACTIVE", desiredCount: 5, runningCount: 5, taskDefinition: "old:1", deploymentController: { type: "CODE_DEPLOY" }, deployments: [] }] };
      if (args[1] === "describe-task-sets") return { taskSets: [{ status: "PRIMARY", taskDefinition: "arn:aws:ecs:ap-northeast-2:123:task-definition/orders:68", createdAt: "2026-09-20T01:00:00.000Z", updatedAt: "2026-09-20T01:04:00.000Z" }] };
      if (args[1] === "describe-task-definition") return { taskDefinition: { family: "orders", revision: 68, containerDefinitions: [{ image: "repo/orders:421" }] } };
      return {};
    });
    const ecs = (await client.inventory({ profile: "prd", region: "ap-northeast-2" })).find((item) => item.service === "ecs");
    expect(ecs?.resources.find((item) => item.kind === "service")?.metadata).toMatchObject({
      taskDefinition: "orders:68",
      revision: 68,
      deployedAt: "2026-09-20T01:04:00.000Z",
      deploymentSource: "ECS_TASK_SET",
    });
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

    await request(app).put("/api/aws-context").set("Authorization", `Bearer ${auth}`).send({ name: "공용", profile: "team-account", region: "ap-northeast-2" }).expect(200);
    await request(app).post("/api/aws-context/refresh").set("Authorization", `Bearer ${auth}`).expect(200);
    const result = await request(app).get("/api/aws-context").set("Authorization", `Bearer ${auth}`).expect(200);
    expect(result.body).toMatchObject({ connected: true, activeAccount: "공용", profile: "team-account", region: "ap-northeast-2", accountHint: "9012", principal: "demo-user" });
    expect(result.body.accounts).toEqual([expect.objectContaining({ name: "공용", profile: "team-account" })]);
    expect(result.body.inventory[0].resources[0].id).toBe("orders-api");
    expect(JSON.stringify(result.body)).not.toContain("123456789012");
  });

  it("keeps per-account snapshots and switches the active account", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    await syncUser(db, { userId: "u2" });
    const auth = (await seedUserToken(db, "u2")).replace(/^Bearer /, "");
    const fake: AwsContextClient = {
      identity: async ({ profile }) => ({ accountId: profile === "dev-profile" ? "111111111111" : "222222222222", arn: `arn:aws:iam::123:user/${profile}` }),
      inventory: async ({ profile }) => [{ service: "codecommit", resources: [{ service: "codecommit", kind: "repository", id: `${profile}-repo` }] }],
    };
    const { app } = await createApp({ db, awsContextClient: fake });
    await request(app).put("/api/aws-context").set("Authorization", `Bearer ${auth}`).send({ name: "개발", profile: "dev-profile", region: "ap-northeast-2" }).expect(200);
    await request(app).post("/api/aws-context/refresh").set("Authorization", `Bearer ${auth}`).expect(200);
    await request(app).put("/api/aws-context").set("Authorization", `Bearer ${auth}`).send({ name: "운영", profile: "prd-profile", region: "ap-northeast-2" }).expect(200);
    await request(app).post("/api/aws-context/refresh").set("Authorization", `Bearer ${auth}`).expect(200);
    await request(app).post("/api/aws-context/active").set("Authorization", `Bearer ${auth}`).send({ name: "개발" }).expect(200);
    const result = await request(app).get("/api/aws-context").set("Authorization", `Bearer ${auth}`).expect(200);
    expect(result.body.activeAccount).toBe("개발");
    expect(result.body.accounts).toHaveLength(2);
    expect(result.body.inventory[0].resources[0].id).toBe("dev-profile-repo");
  });

  it("reads a requested account snapshot without changing the UI active account", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    await syncUser(db, { userId: "u3" });
    const auth = (await seedUserToken(db, "u3")).replace(/^Bearer /, "");
    const fake: AwsContextClient = {
      identity: async ({ profile }) => ({ accountId: profile === "default-profile" ? "111111111111" : "222222222222", arn: `arn:aws:iam::123:user/${profile}` }),
      inventory: async ({ profile }) => [{ service: "s3", resources: [{ service: "s3", kind: "bucket", id: `${profile}-bucket` }] }],
    };
    const { app } = await createApp({ db, awsContextClient: fake });
    await request(app).put("/api/aws-context").set("Authorization", `Bearer ${auth}`).send({ name: "default", profile: "default-profile", region: "ap-northeast-2" }).expect(200);
    await request(app).post("/api/aws-context/refresh").set("Authorization", `Bearer ${auth}`).expect(200);
    await request(app).put("/api/aws-context").set("Authorization", `Bearer ${auth}`).send({ name: "team-dev", profile: "dev-profile", region: "ap-northeast-2" }).expect(200);
    await request(app).post("/api/aws-context/refresh").set("Authorization", `Bearer ${auth}`).expect(200);

    const requested = await request(app).get("/api/aws-context?account=default").set("Authorization", `Bearer ${auth}`).expect(200);
    expect(requested.body).toMatchObject({ activeAccount: "default", inventory: [{ resources: [{ id: "default-profile-bucket" }] }] });
    const uiActive = await request(app).get("/api/aws-context").set("Authorization", `Bearer ${auth}`).expect(200);
    expect(uiActive.body.activeAccount).toBe("team-dev");
  });

  it("refreshes every connected account without changing the selected account", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    await syncUser(db, { userId: "u4" });
    const auth = (await seedUserToken(db, "u4")).replace(/^Bearer /, "");
    const refreshed: string[] = [];
    const fake: AwsContextClient = {
      identity: async ({ profile }) => ({ accountId: profile, arn: `arn:aws:iam::123:user/${profile}` }),
      inventory: async ({ profile }) => { refreshed.push(profile); return [{ service: "s3", resources: [] }]; },
    };
    const { app } = await createApp({ db, awsContextClient: fake });
    await request(app).put("/api/aws-context").set("Authorization", `Bearer ${auth}`).send({ name: "team-dev", profile: "dev", region: "ap-northeast-2" }).expect(200);
    await request(app).put("/api/aws-context").set("Authorization", `Bearer ${auth}`).send({ name: "team-prd", profile: "prd", region: "ap-northeast-2" }).expect(200);
    const result = await request(app).post("/api/aws-context/refresh-all").set("Authorization", `Bearer ${auth}`).expect(200);
    expect(result.body).toMatchObject({ refreshed: ["team-dev", "team-prd"] });
    expect(refreshed).toEqual(["dev", "prd"]);
    await request(app).post("/api/aws-context/refresh-all").set("Authorization", `Bearer ${auth}`).expect(200);
    expect(refreshed).toEqual(["dev", "prd"]);
    expect((await request(app).get("/api/aws-context").set("Authorization", `Bearer ${auth}`)).body.activeAccount).toBe("team-prd");
  });

  it("blocks chargeable inventory refreshes before AWS calls when cooldown or daily budget is exhausted", async () => {
    const db = createSqliteClient(); await db.execScript(schema); await syncUser(db, { userId: 'u5' });
    const auth = (await seedUserToken(db, 'u5')).replace(/^Bearer /, ''); let calls = 0;
    const fake: AwsContextClient = { identity: async () => ({ accountId: '123', arn: 'arn:aws:iam::123:user/test' }), inventory: async () => { calls += 1; return []; } };
    const { app } = await createApp({ db, awsContextClient: fake });
    await request(app).put('/api/aws-context').set('Authorization', `Bearer ${auth}`).send({ name: 'default', profile: 'default', region: 'ap-northeast-2' }).expect(200);
    await request(app).post('/api/aws-context/refresh').set('Authorization', `Bearer ${auth}`).expect(200);
    await db.exec("UPDATE user_aws_context_snapshots SET observed_at = ? WHERE user_id = ? AND account_name = ?", [new Date(Date.now() - 10 * 60_000).toISOString(), 'u5', 'default']);
    await request(app).post('/api/aws-context/refresh').set('Authorization', `Bearer ${auth}`).expect(429).expect(({ body }) => expect(body.error).toBe('AWS_REFRESH_COOLDOWN'));
    expect(calls).toBe(1);
    await db.exec("UPDATE user_aws_context_refresh_budget SET day_count = 4, last_started_at = ? WHERE user_id = ? AND account_name = ?", [new Date(Date.now() - 2 * 60 * 60_000).toISOString(), 'u5', 'default']);
    await request(app).post('/api/aws-context/refresh').set('Authorization', `Bearer ${auth}`).expect(429).expect(({ body }) => expect(body.error).toBe('AWS_REFRESH_DAILY_LIMIT'));
    expect(calls).toBe(1);
  });
});
