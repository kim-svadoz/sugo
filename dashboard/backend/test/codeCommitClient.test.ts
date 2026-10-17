import { describe, expect, it } from "vitest";
import { createAwsCodeCommitClient } from "../src/git/codeCommitClient.js";

const repo = { baseUrl: "ap-northeast-2", namespace: "repos", repo: "orders-api", token: "", profile: "dev" };

describe("AWS CodeCommit adapter", () => {
  it("passes region/profile to the SigV4 SDK client and creates a pull request", async () => {
    const configs: unknown[] = [];
    const commands: any[] = [];
    const client = createAwsCodeCommitClient((config) => {
      configs.push(config);
      return { send: async (command: any) => { commands.push(command); return { pullRequest: { pullRequestId: "42" } }; } };
    });
    const result = await client.createPullRequest(repo, { title: "Feature", description: "Body", fromBranch: "feat/x", toBranch: "development" });
    expect(configs).toEqual([{ region: "ap-northeast-2", profile: "dev" }]);
    expect(commands[0].input).toMatchObject({ targets: [{ repositoryName: "orders-api", sourceReference: "feat/x", destinationReference: "development" }] });
    expect(result).toEqual({ id: "42", url: expect.stringContaining("ap-northeast-2.console.aws.amazon.com") });
  });

  it("finds an open pull request by its source reference", async () => {
    const client = createAwsCodeCommitClient(() => ({
      send: async (command: any) => command.constructor.name === "ListPullRequestsCommand"
        ? { pullRequestIds: ["10"] }
        : { pullRequest: { pullRequestTargets: [{ sourceReference: "refs/heads/feat/x" }] } },
    }));
    await expect(client.findOpenPr(repo, "feat/x")).resolves.toMatchObject({ id: "10" });
  });

  it("returns false only for CodeCommit's missing-branch error", async () => {
    const client = createAwsCodeCommitClient(() => ({ send: async () => { throw Object.assign(new Error("missing"), { name: "BranchDoesNotExistException" }); } }));
    await expect(client.remoteBranchExists(repo, "missing")).resolves.toBe(false);
  });
});
