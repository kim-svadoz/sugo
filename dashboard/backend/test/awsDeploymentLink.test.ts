import { describe, expect, it } from "vitest";
import { linkAwsDeployments, linkAwsRelease } from "../src/services/awsDeploymentLink.js";

describe("AWS ECS deployment linking", () => {
  it("links exact {project}-service names across environments", () => {
    const linked = linkAwsDeployments("/work/orders-api", [
      {
        accountName: "team-dev",
        region: "ap-northeast-2",
        observedAt: "2026-09-29T00:00:00.000Z",
        inventory: [{ service: "ecs", resources: [{ kind: "service", id: "orders-api-service", metadata: { cluster: "orders-api-cluster", taskDefinition: "orders-api:343", revision: 343, rolloutState: "COMPLETED", desiredCount: 1, runningCount: 1, images: ["repo/orders-api:343"], deployedAt: "2026-09-28T08:03:00.000Z" } }] }],
      },
      {
        accountName: "team-prd",
        region: "ap-northeast-2",
        observedAt: "2026-09-29T00:01:00.000Z",
        inventory: [{ service: "ecs", resources: [{ kind: "service", id: "other-service", metadata: {} }] }],
      },
    ]);
    expect(linked).toEqual([
      expect.objectContaining({ environment: "dev", service: "orders-api-service", revision: 343, rolloutState: "COMPLETED", healthState: "HEALTHY", matchSource: "image", runningCount: 1, desiredCount: 1, deployedAt: "2026-09-28T08:03:00.000Z" }),
    ]);
  });

  it("does not guess partial project names", () => {
    const linked = linkAwsDeployments("/work/orders", [{
      accountName: "team-dev", region: "ap-northeast-2", observedAt: null,
      inventory: [{ service: "ecs", resources: [{ kind: "service", id: "orders-api-service", metadata: {} }] }],
    }]);
    expect(linked).toEqual([]);
  });

  it("orders deployment environments as dev, stg, prd", () => {
    const snapshots = ["team-prd", "team-dev", "team-stg"].map((accountName) => ({
      accountName, region: "ap-northeast-2", observedAt: null,
      inventory: [{ service: "ecs", resources: [{ kind: "service", id: "api-service", metadata: {} }] }],
    }));
    expect(linkAwsDeployments("/work/api", snapshots).map((item) => item.environment)).toEqual(["dev", "stg", "prd"]);
  });

  it("links multiple ECS services that run images built from the repository", () => {
    const snapshots = [{
      accountName: "team-prd", region: "ap-northeast-2", observedAt: null,
      inventory: [{ service: "ecs", resources: [
        { kind: "service", id: "orders-service", metadata: { status: "ACTIVE", desiredCount: 3, runningCount: 3, images: ["123.dkr.ecr.ap-northeast-2.amazonaws.com/orders-api:421"] } },
        { kind: "service", id: "orders-api-service", metadata: { status: "ACTIVE", desiredCount: 3, runningCount: 3, images: ["123.dkr.ecr.ap-northeast-2.amazonaws.com/orders-api:421"] } },
      ] }],
    }];
    expect(linkAwsDeployments("/work/orders-api", snapshots)).toEqual([
      expect.objectContaining({ service: "orders-api-service", matchSource: "image", healthState: "HEALTHY" }),
      expect.objectContaining({ service: "orders-service", matchSource: "image", healthState: "HEALTHY" }),
    ]);
  });

  it("normalizes raw AWS rollout differences into one health state", () => {
    const snapshots = [{
      accountName: "team-dev", region: "ap-northeast-2", observedAt: null,
      inventory: [{ service: "ecs", resources: [
        { kind: "service", id: "api-service", metadata: { status: "ACTIVE", rolloutState: "COMPLETED", desiredCount: 1, runningCount: 1 } },
      ] }],
    }];
    expect(linkAwsDeployments("/work/api", snapshots)[0]).toMatchObject({ rolloutState: "COMPLETED", healthState: "HEALTHY" });
  });
});

describe("AWS release pipeline linking", () => {
  it("uses the CodePipeline source contract instead of guessing a branch from a repository name", () => {
    const linked = linkAwsRelease("/work/orders-api", [{
      accountName: "default", region: "ap-northeast-2", observedAt: null,
      inventory: [{ service: "codepipeline", resources: [{
        kind: "pipeline", id: "orders-api-pipeline", metadata: {
          repositoryName: "orders-api", branchName: "development", buildProject: "orders-api-build",
          latestBuildNumber: 421, latestBuildCommit: "abc1234def567890", latestBuildStatus: "SUCCEEDED",
        },
      }] }],
    }]);
    expect(linked).toEqual(expect.objectContaining({ baseBranch: "development", latestBuildNumber: 421, latestBuildCommit: "abc1234def567890" }));
  });
});
