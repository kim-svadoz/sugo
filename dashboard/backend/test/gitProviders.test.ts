import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { detectGitProvider, repositoryFor, type GitProviderClient } from "../src/git/provider.js";
import { syncRoadmap, syncUser } from "../src/services/syncService.js";
import { seedUserToken } from "./testAuth.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");
const secretEncKey = randomBytes(32).toString("base64");

describe("git provider detection", () => {
  const base = { projectKey: "team", repoSlug: "service", sourceBranch: "feat/x", targetBranch: "develop" };
  it.each([
    ["https://github.com/team/service.git", "github"],
    ["git@gitlab.com:team/service.git", "gitlab"],
    ["https://git-codecommit.ap-northeast-2.amazonaws.com/v1/repos/service", "aws_codecommit"],
    ["ssh://git@bitbucket.example/team/service.git", "bitbucket_server"],
  ])("detects %s", (remoteUrl, expected) => {
    expect(detectGitProvider({ ...base, baseUrl: "", remoteUrl })).toBe(expected);
  });

  it("prefers an explicit provider for self-hosted remotes", () => {
    expect(detectGitProvider({ ...base, baseUrl: "https://git.example", provider: "gitlab" })).toBe("gitlab");
  });

  it("uses provider defaults without replacing an explicit self-hosted URL", () => {
    expect(repositoryFor({ ...base, baseUrl: "https://gitlab.internal" }, { provider: "gitlab", token: "x", baseUrl: null })).toMatchObject({
      baseUrl: "https://gitlab.internal", namespace: "team", repo: "service",
    });
  });

  it("maps github.com remotes to the GitHub API endpoint", () => {
    expect(repositoryFor({ ...base, baseUrl: "https://github.com" }, { provider: "github", token: "x", baseUrl: null }).baseUrl).toBe("https://api.github.com");
  });
});

describe("/api/git-connections", () => {
  it("is local-first, stores secrets encrypted, and never returns a token", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    await syncUser(db, { userId: "u1" });
    const token = (await seedUserToken(db, "u1")).replace(/^Bearer /, "");
    const unavailable = {} as GitProviderClient;
    const { app } = await createApp({ db, secretEncKey, gitProviderClients: { github: unavailable, gitlab: unavailable } });

    const empty = await request(app).get("/api/git-connections").set("Authorization", `Bearer ${token}`).expect(200);
    expect(empty.body.connections).toEqual([]);
    expect(empty.body.providers).toEqual(expect.arrayContaining([expect.objectContaining({ id: "github", status: "available" }), expect.objectContaining({ id: "aws_codecommit", status: "available", authMode: "aws_default_chain" })]));

    await request(app).put("/api/git-connections").set("Authorization", `Bearer ${token}`).send({ provider: "github", token: "github-secret-1234" }).expect(200);
    const status = await request(app).get("/api/git-connections").set("Authorization", `Bearer ${token}`).expect(200);
    expect(status.body.connections).toEqual([expect.objectContaining({ provider: "github", hint: "1234", connected: true })]);
    expect(JSON.stringify(status.body)).not.toContain("github-secret");
    const rows = await db.query<{ ct: string }>("SELECT ct FROM user_git_connections WHERE user_id = ?", ["u1"]);
    expect(rows[0].ct).not.toContain("github-secret");
  });

  it("registers CodeCommit without storing AWS access keys", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    await syncUser(db, { userId: "u1" });
    const token = (await seedUserToken(db, "u1")).replace(/^Bearer /, "");
    const { app } = await createApp({ db, secretEncKey });
    await request(app).put("/api/git-connections").set("Authorization", `Bearer ${token}`).send({ provider: "aws_codecommit", profile: "sugo-dev" }).expect(200);
    const response = await request(app).get("/api/git-connections").set("Authorization", `Bearer ${token}`).expect(200);
    expect(response.body.connections).toEqual([expect.objectContaining({ provider: "aws_codecommit", hint: null, profile: "sugo-dev" })]);
  });
});

describe("provider-neutral PR routing", () => {
  it("routes a GitHub work-result through the GitHub adapter", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    await syncUser(db, { userId: "u1" });
    await syncRoadmap(db, "u1", "ws1", [{
      id: "task-1", title: "Task", level: "task", status: "done",
      workResult: { prRefs: { baseUrl: "https://github.com", projectKey: "team", repoSlug: "service", sourceBranch: "feat/x", targetBranch: "development" } },
    }]);
    const calls: string[] = [];
    const github: GitProviderClient = {
      async remoteBranchExists(repo) { calls.push(`branch:${repo.baseUrl}`); return true; },
      async findOpenPr() { calls.push("lookup"); return null; },
      async createPullRequest() { calls.push("create"); return { id: 8, url: "https://github.com/team/service/pull/8" }; },
    };
    const auth = (await seedUserToken(db, "u1")).replace(/^Bearer /, "");
    const { app } = await createApp({ db, secretEncKey, gitProviderClients: { github } });
    await request(app).put("/api/git-connections").set("Authorization", `Bearer ${auth}`).send({ provider: "github", token: "gh-token" }).expect(200);
    const response = await request(app).post("/api/pr/create").set("Authorization", `Bearer ${auth}`).send({ workspace: "ws1", nodeId: "task-1", scope: "task" }).expect(200);
    expect(response.body.pr.url).toContain("github.com");
    expect(calls).toEqual(["branch:https://api.github.com", "lookup", "create"]);
  });

  it("routes a CodeCommit remote through the AWS adapter and detected region", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    await syncUser(db, { userId: "u1" });
    await syncRoadmap(db, "u1", "ws1", [{
      id: "task-aws", title: "AWS Task", level: "task", status: "done",
      workResult: { prRefs: { baseUrl: "https://git-codecommit.ap-northeast-2.amazonaws.com", projectKey: "repos", repoSlug: "service", sourceBranch: "feat/aws", targetBranch: "development" } },
    }]);
    const seen: unknown[] = [];
    const aws: GitProviderClient = {
      async remoteBranchExists(repo) { seen.push(repo); return true; },
      async findOpenPr() { return null; },
      async createPullRequest(repo) { seen.push(repo); return { id: "77", url: "https://console.aws.amazon.com/codecommit/77" }; },
    };
    const auth = (await seedUserToken(db, "u1")).replace(/^Bearer /, "");
    const { app } = await createApp({ db, secretEncKey, gitProviderClients: { aws_codecommit: aws } });
    await request(app).put("/api/git-connections").set("Authorization", `Bearer ${auth}`).send({ provider: "aws_codecommit", profile: "dev" }).expect(200);
    await request(app).post("/api/pr/create").set("Authorization", `Bearer ${auth}`).send({ workspace: "ws1", nodeId: "task-aws", scope: "task" }).expect(200);
    expect(seen[0]).toMatchObject({ baseUrl: "ap-northeast-2", repo: "service", profile: "dev", token: "" });
  });
});
