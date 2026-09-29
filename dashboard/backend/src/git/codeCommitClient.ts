import {
  CodeCommitClient,
  CreatePullRequestCommand,
  GetBranchCommand,
  GetPullRequestCommand,
  ListPullRequestsCommand,
  type CodeCommitClientConfig,
} from "@aws-sdk/client-codecommit";
import type { GitProviderClient, GitRepositoryRef, PullRequestRef } from "./provider.js";

interface AwsSender {
  send(command: object): Promise<any>;
}

type AwsClientFactory = (config: CodeCommitClientConfig) => AwsSender;

function regionOf(repo: GitRepositoryRef): string {
  if (!repo.baseUrl) throw new Error("AWS CodeCommit region could not be detected from the remote URL");
  return repo.baseUrl;
}

function consoleUrl(region: string, repositoryName: string, pullRequestId: string): string {
  return `https://${region}.console.aws.amazon.com/codesuite/codecommit/repositories/${encodeURIComponent(repositoryName)}/pull-requests/${pullRequestId}/details?region=${encodeURIComponent(region)}`;
}

function clientFor(repo: GitRepositoryRef, factory: AwsClientFactory): AwsSender {
  return factory({ region: regionOf(repo), ...(repo.profile ? { profile: repo.profile } : {}) });
}

export function createAwsCodeCommitClient(factory: AwsClientFactory = (config) => new CodeCommitClient(config)): GitProviderClient {
  return {
    async remoteBranchExists(repo, branch) {
      try {
        await clientFor(repo, factory).send(new GetBranchCommand({ repositoryName: repo.repo, branchName: branch }));
        return true;
      } catch (error) {
        if ((error as { name?: string }).name === "BranchDoesNotExistException") return false;
        throw error;
      }
    },
    async findOpenPr(repo, fromBranch) {
      const client = clientFor(repo, factory);
      let nextToken: string | undefined;
      do {
        const listed = await client.send(new ListPullRequestsCommand({ repositoryName: repo.repo, pullRequestStatus: "OPEN", nextToken }));
        for (const id of listed.pullRequestIds ?? []) {
          const result = await client.send(new GetPullRequestCommand({ pullRequestId: id }));
          const matches = result.pullRequest?.pullRequestTargets?.some((target: { sourceReference?: string }) =>
            target.sourceReference?.replace(/^refs\/heads\//, "") === fromBranch
          );
          if (matches) return { id, url: consoleUrl(regionOf(repo), repo.repo, id) };
        }
        nextToken = listed.nextToken;
      } while (nextToken);
      return null;
    },
    async createPullRequest(repo, input): Promise<PullRequestRef> {
      const result = await clientFor(repo, factory).send(new CreatePullRequestCommand({
        title: input.title,
        description: input.description,
        targets: [{ repositoryName: repo.repo, sourceReference: input.fromBranch, destinationReference: input.toBranch }],
      }));
      const id = result.pullRequest?.pullRequestId;
      if (!id) throw new Error("AWS CodeCommit did not return a pull request id");
      return { id, url: consoleUrl(regionOf(repo), repo.repo, id) };
    },
  };
}
