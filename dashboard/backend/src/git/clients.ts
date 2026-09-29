import type { BitbucketClient } from "../bitbucket/client.js";
import type { GitProviderClient, GitRepositoryRef } from "./provider.js";

export interface GitProviderClients {
  github: GitProviderClient;
  gitlab: GitProviderClient;
  bitbucket_server: GitProviderClient;
  aws_codecommit: GitProviderClient;
}

export function adaptBitbucketClient(client: BitbucketClient): GitProviderClient {
  const repoRef = (repo: GitRepositoryRef) => ({
    baseUrl: repo.baseUrl,
    projectKey: repo.namespace,
    repoSlug: repo.repo,
    token: repo.token,
  });
  return {
    remoteBranchExists: (repo, branch) => client.remoteBranchExists(repoRef(repo), branch),
    findOpenPr: (repo, branch) => client.findOpenPr(repoRef(repo), branch),
    createPullRequest: (repo, input) => client.createPullRequest(repoRef(repo), input),
  };
}
