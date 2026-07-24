export interface PrRef {
  id: number;
  url: string;
}

export interface BitbucketRepoRef {
  baseUrl: string;
  projectKey: string;
  repoSlug: string;
  token: string;
}

// §6: Bitbucket Server (Data Center) REST v1.0. Injected the same way
// DbClient/OidcTokenClient are - real HTTP implementation for production,
// fake in-memory one for tests (no real Bitbucket Server reachable here).
export interface BitbucketClient {
  remoteBranchExists(repo: BitbucketRepoRef, branch: string): Promise<boolean>;
  findOpenPr(repo: BitbucketRepoRef, fromBranch: string): Promise<PrRef | null>;
  createPullRequest(
    repo: BitbucketRepoRef,
    input: { title: string; description?: string; fromBranch: string; toBranch: string }
  ): Promise<PrRef>;
}

function restBase(repo: BitbucketRepoRef): string {
  return `${repo.baseUrl.replace(/\/$/, "")}/rest/api/1.0/projects/${repo.projectKey}/repos/${repo.repoSlug}`;
}

function authHeaders(repo: BitbucketRepoRef): Record<string, string> {
  return { Authorization: `Bearer ${repo.token}`, "Content-Type": "application/json" };
}

export function createHttpBitbucketClient(): BitbucketClient {
  return {
    async remoteBranchExists(repo, branch) {
      const res = await fetch(`${restBase(repo)}/branches?filterText=${encodeURIComponent(branch)}`, {
        headers: authHeaders(repo),
      });
      if (!res.ok) throw new Error(`Bitbucket branches lookup failed: ${res.status}`);
      const data = (await res.json()) as { values?: { displayId: string }[] };
      return (data.values ?? []).some((b) => b.displayId === branch);
    },

    async findOpenPr(repo, fromBranch) {
      const res = await fetch(
        `${restBase(repo)}/pull-requests?state=OPEN&direction=OUTGOING&at=refs/heads/${encodeURIComponent(fromBranch)}`,
        { headers: authHeaders(repo) }
      );
      if (!res.ok) throw new Error(`Bitbucket PR lookup failed: ${res.status}`);
      const data = (await res.json()) as { values?: { id: number; links?: { self?: { href: string }[] } }[] };
      const first = (data.values ?? [])[0];
      if (!first) return null;
      return { id: first.id, url: first.links?.self?.[0]?.href ?? "" };
    },

    async createPullRequest(repo, input) {
      const res = await fetch(`${restBase(repo)}/pull-requests`, {
        method: "POST",
        headers: authHeaders(repo),
        body: JSON.stringify({
          title: input.title,
          description: input.description ?? "",
          fromRef: { id: `refs/heads/${input.fromBranch}` },
          toRef: { id: `refs/heads/${input.toBranch}` },
        }),
      });
      if (!res.ok) throw new Error(`Bitbucket PR create failed: ${res.status}`);
      const data = (await res.json()) as { id: number; links?: { self?: { href: string }[] } };
      return { id: data.id, url: data.links?.self?.[0]?.href ?? "" };
    },
  };
}
