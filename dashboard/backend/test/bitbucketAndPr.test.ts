import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { createJwtVerifier } from "../src/auth/jwt.js";
import { syncRoadmap, syncUser } from "../src/services/syncService.js";
import type { BitbucketClient, BitbucketRepoRef, PrRef } from "../src/bitbucket/client.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");
const SECRET_ENC_KEY = randomBytes(32).toString("base64");

async function testBearer() {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.kid = "k1";
  const verifyJwt = createJwtVerifier(createLocalJWKSet({ keys: [jwk] }));
  const token = await new SignJWT({ account_id: "u1" })
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
  return { verifyJwt, token };
}

class FakeBitbucketClient implements BitbucketClient {
  public created: unknown[] = [];
  constructor(
    private branchExists: boolean,
    private existingPr: PrRef | null
  ) {}
  async remoteBranchExists(_repo: BitbucketRepoRef, _branch: string): Promise<boolean> {
    return this.branchExists;
  }
  async findOpenPr(_repo: BitbucketRepoRef, _fromBranch: string): Promise<PrRef | null> {
    return this.existingPr;
  }
  async createPullRequest(_repo: BitbucketRepoRef, input: { title: string; fromBranch: string; toBranch: string }): Promise<PrRef> {
    this.created.push(input);
    return { id: 42, url: "https://bb.example/pr/42" };
  }
}

async function appWithNode(bitbucketClient: BitbucketClient) {
  const db = createSqliteClient();
  await db.execScript(schema);
  await syncUser(db, { userId: "u1" });
  await syncRoadmap(db, "u1", "ws1", [
    {
      id: "t1",
      title: "T1",
      level: "task",
      status: "done",
      workResult: { prRefs: { baseUrl: "https://bb.example", projectKey: "P", repoSlug: "r", sourceBranch: "feat/t1" } },
    },
  ]);
  const { verifyJwt, token } = await testBearer();
  const { app } = await createApp({ db, verifyJwt, bitbucketClient, secretEncKey: SECRET_ENC_KEY });
  return { app, db, token };
}

describe("GET/PUT/DELETE /api/bitbucket — §3.5, AUTH-gated", () => {
  it("requires a bearer token", async () => {
    const { app } = await appWithNode(new FakeBitbucketClient(true, null));
    await request(app).get("/api/bitbucket").expect(401);
  });

  it("reports disconnected before any token is set", async () => {
    const { app, token } = await appWithNode(new FakeBitbucketClient(true, null));
    const res = await request(app).get("/api/bitbucket").set("Authorization", `Bearer ${token}`).expect(200);
    expect(res.body).toEqual({ connected: false, hint: null, baseUrl: null, updatedAt: null });
  });

  it("PUT stores the token encrypted, GET never returns it (only hint)", async () => {
    const { app, db, token } = await appWithNode(new FakeBitbucketClient(true, null));
    await request(app)
      .put("/api/bitbucket")
      .set("Authorization", `Bearer ${token}`)
      .send({ token: "super-secret-pat-9999", baseUrl: "https://bb.example" })
      .expect(200);

    const res = await request(app).get("/api/bitbucket").set("Authorization", `Bearer ${token}`).expect(200);
    expect(res.body).toEqual({ connected: true, hint: "9999", baseUrl: "https://bb.example", updatedAt: expect.any(String) });
    expect(JSON.stringify(res.body)).not.toContain("super-secret-pat");

    const rows = await db.query<{ ct: string }>("SELECT ct FROM user_bitbucket_tokens WHERE user_id='u1'");
    expect(rows[0].ct).not.toContain("super-secret-pat");
  });

  it("DELETE removes the stored token", async () => {
    const { app, token } = await appWithNode(new FakeBitbucketClient(true, null));
    await request(app).put("/api/bitbucket").set("Authorization", `Bearer ${token}`).send({ token: "x" }).expect(200);
    await request(app).delete("/api/bitbucket").set("Authorization", `Bearer ${token}`).expect(200);
    const res = await request(app).get("/api/bitbucket").set("Authorization", `Bearer ${token}`).expect(200);
    expect(res.body.connected).toBe(false);
  });
});

describe("POST /api/pr/create — §3.4/§6", () => {
  it("반드시 거부: NO_TOKEN when no PAT stored", async () => {
    const { app, token } = await appWithNode(new FakeBitbucketClient(true, null));
    const res = await request(app)
      .post("/api/pr/create")
      .set("Authorization", `Bearer ${token}`)
      .send({ workspace: "ws1", nodeId: "t1", scope: "task" })
      .expect(409);
    expect(res.body.error).toBe("NO_TOKEN");
  });

  it("반드시 거부: BRANCH_NOT_PUSHED when the remote branch doesn't exist", async () => {
    const { app, token } = await appWithNode(new FakeBitbucketClient(false, null));
    await request(app).put("/api/bitbucket").set("Authorization", `Bearer ${token}`).send({ token: "pat" }).expect(200);
    const res = await request(app)
      .post("/api/pr/create")
      .set("Authorization", `Bearer ${token}`)
      .send({ workspace: "ws1", nodeId: "t1", scope: "task" })
      .expect(409);
    expect(res.body.error).toBe("BRANCH_NOT_PUSHED");
  });

  it("creates a PR when branch exists and none is open yet", async () => {
    const client = new FakeBitbucketClient(true, null);
    const { app, token } = await appWithNode(client);
    await request(app).put("/api/bitbucket").set("Authorization", `Bearer ${token}`).send({ token: "pat" }).expect(200);
    const res = await request(app)
      .post("/api/pr/create")
      .set("Authorization", `Bearer ${token}`)
      .send({ workspace: "ws1", nodeId: "t1", scope: "task", title: "My PR" })
      .expect(200);
    expect(res.body).toEqual({ pr: { id: 42, url: "https://bb.example/pr/42" }, existed: false });
    expect(client.created).toHaveLength(1);
  });

  it("returns the existing PR instead of creating a duplicate", async () => {
    const client = new FakeBitbucketClient(true, { id: 7, url: "https://bb.example/pr/7" });
    const { app, token } = await appWithNode(client);
    await request(app).put("/api/bitbucket").set("Authorization", `Bearer ${token}`).send({ token: "pat" }).expect(200);
    const res = await request(app)
      .post("/api/pr/create")
      .set("Authorization", `Bearer ${token}`)
      .send({ workspace: "ws1", nodeId: "t1", scope: "task" })
      .expect(200);
    expect(res.body).toEqual({ pr: { id: 7, url: "https://bb.example/pr/7" }, existed: true });
    expect(client.created).toHaveLength(0);
  });

  it("반드시 거부: NO_REFS when the node has no prRefs", async () => {
    const { app, token } = await appWithNode(new FakeBitbucketClient(true, null));
    await request(app).put("/api/bitbucket").set("Authorization", `Bearer ${token}`).send({ token: "pat" }).expect(200);
    const res = await request(app)
      .post("/api/pr/create")
      .set("Authorization", `Bearer ${token}`)
      .send({ workspace: "ws1", nodeId: "does-not-exist", scope: "task" })
      .expect(409);
    expect(res.body.error).toBe("NO_REFS");
  });
});

describe("POST /api/pr/existing — best-effort, always 200", () => {
  it("returns exists:false with an error code instead of failing hard", async () => {
    const { app, token } = await appWithNode(new FakeBitbucketClient(true, null));
    const res = await request(app)
      .post("/api/pr/existing")
      .set("Authorization", `Bearer ${token}`)
      .send({ workspace: "ws1", nodeId: "t1", scope: "task" })
      .expect(200);
    expect(res.body).toEqual({ exists: false, error: "NO_TOKEN" });
  });

  it("returns exists:true with the PR when one is open", async () => {
    const client = new FakeBitbucketClient(true, { id: 9, url: "https://bb.example/pr/9" });
    const { app, token } = await appWithNode(client);
    await request(app).put("/api/bitbucket").set("Authorization", `Bearer ${token}`).send({ token: "pat" }).expect(200);
    const res = await request(app)
      .post("/api/pr/existing")
      .set("Authorization", `Bearer ${token}`)
      .send({ workspace: "ws1", nodeId: "t1", scope: "task" })
      .expect(200);
    expect(res.body).toEqual({ exists: true, pr: { id: 9, url: "https://bb.example/pr/9" } });
  });
});
