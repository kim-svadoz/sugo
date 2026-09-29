import type { GitProviderClient, GitRepositoryRef, PullRequestRef } from "./provider.js";

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function githubHeaders(token: string): Record<string, string> {
  return { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" };
}

export function createHttpGithubClient(): GitProviderClient {
  const endpoint = (repo: GitRepositoryRef, suffix: string) => `${trimSlash(repo.baseUrl || "https://api.github.com")}/repos/${encodeURIComponent(repo.namespace)}/${encodeURIComponent(repo.repo)}${suffix}`;
  return {
    async remoteBranchExists(repo, branch) {
      const response = await fetch(endpoint(repo, `/branches/${encodeURIComponent(branch)}`), { headers: githubHeaders(repo.token) });
      if (response.status === 404) return false;
      if (!response.ok) throw new Error(`GitHub branch lookup failed: ${response.status}`);
      return true;
    },
    async findOpenPr(repo, fromBranch) {
      const query = new URLSearchParams({ state: "open", head: `${repo.namespace}:${fromBranch}`, per_page: "1" });
      const response = await fetch(endpoint(repo, `/pulls?${query}`), { headers: githubHeaders(repo.token) });
      if (!response.ok) throw new Error(`GitHub PR lookup failed: ${response.status}`);
      const items = (await response.json()) as Array<{ number: number; html_url: string }>;
      return items[0] ? { id: items[0].number, url: items[0].html_url } : null;
    },
    async createPullRequest(repo, input) {
      const response = await fetch(endpoint(repo, "/pulls"), {
        method: "POST",
        headers: { ...githubHeaders(repo.token), "Content-Type": "application/json" },
        body: JSON.stringify({ title: input.title, body: input.description, head: input.fromBranch, base: input.toBranch }),
      });
      if (!response.ok) throw new Error(`GitHub PR create failed: ${response.status}`);
      const item = (await response.json()) as { number: number; html_url: string };
      return { id: item.number, url: item.html_url };
    },
  };
}

function gitlabApiBase(baseUrl: string): string {
  const clean = trimSlash(baseUrl || "https://gitlab.com");
  return clean.endsWith("/api/v4") ? clean : `${clean}/api/v4`;
}

export function createHttpGitlabClient(): GitProviderClient {
  const endpoint = (repo: GitRepositoryRef, suffix: string) => `${gitlabApiBase(repo.baseUrl)}/projects/${encodeURIComponent(`${repo.namespace}/${repo.repo}`)}${suffix}`;
  const headers = (token: string) => ({ "PRIVATE-TOKEN": token });
  return {
    async remoteBranchExists(repo, branch) {
      const response = await fetch(endpoint(repo, `/repository/branches/${encodeURIComponent(branch)}`), { headers: headers(repo.token) });
      if (response.status === 404) return false;
      if (!response.ok) throw new Error(`GitLab branch lookup failed: ${response.status}`);
      return true;
    },
    async findOpenPr(repo, fromBranch) {
      const query = new URLSearchParams({ state: "opened", source_branch: fromBranch, per_page: "1" });
      const response = await fetch(endpoint(repo, `/merge_requests?${query}`), { headers: headers(repo.token) });
      if (!response.ok) throw new Error(`GitLab MR lookup failed: ${response.status}`);
      const items = (await response.json()) as Array<{ iid: number; web_url: string }>;
      return items[0] ? { id: items[0].iid, url: items[0].web_url } : null;
    },
    async createPullRequest(repo, input) {
      const response = await fetch(endpoint(repo, "/merge_requests"), {
        method: "POST",
        headers: { ...headers(repo.token), "Content-Type": "application/json" },
        body: JSON.stringify({ title: input.title, description: input.description, source_branch: input.fromBranch, target_branch: input.toBranch }),
      });
      if (!response.ok) throw new Error(`GitLab MR create failed: ${response.status}`);
      const item = (await response.json()) as { iid: number; web_url: string };
      return { id: item.iid, url: item.web_url };
    },
  };
}
