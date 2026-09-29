import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpGithubClient, createHttpGitlabClient } from "../src/git/httpClients.js";

afterEach(() => vi.unstubAllGlobals());

describe("Git provider HTTP adapters", () => {
  it("uses GitHub's repository pull request contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ number: 12, html_url: "https://github.com/acme/api/pull/12" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await createHttpGithubClient().createPullRequest(
      { baseUrl: "https://api.github.com", namespace: "acme", repo: "api", token: "secret" },
      { title: "Feature", description: "Body", fromBranch: "feat/x", toBranch: "development" }
    );
    expect(result.id).toBe(12);
    expect(fetchMock).toHaveBeenCalledWith("https://api.github.com/repos/acme/api/pulls", expect.objectContaining({ method: "POST" }));
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ Authorization: "Bearer secret" });
    expect(JSON.parse(String(init.body))).toMatchObject({ head: "feat/x", base: "development" });
  });

  it("URL-encodes GitLab project paths and uses merge request fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ iid: 7, web_url: "https://gitlab.com/acme/api/-/merge_requests/7" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    await createHttpGitlabClient().createPullRequest(
      { baseUrl: "https://gitlab.com", namespace: "acme/platform", repo: "api", token: "secret" },
      { title: "Feature", fromBranch: "feat/x", toBranch: "development" }
    );
    expect(fetchMock.mock.calls[0][0]).toBe("https://gitlab.com/api/v4/projects/acme%2Fplatform%2Fapi/merge_requests");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ "PRIVATE-TOKEN": "secret" });
    expect(JSON.parse(String(init.body))).toMatchObject({ source_branch: "feat/x", target_branch: "development" });
  });

  it("treats a provider 404 as a missing remote branch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    await expect(createHttpGitlabClient().remoteBranchExists(
      { baseUrl: "https://gitlab.com", namespace: "acme", repo: "api", token: "secret" }, "feat/missing"
    )).resolves.toBe(false);
  });
});
