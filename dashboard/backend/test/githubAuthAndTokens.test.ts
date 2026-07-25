import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { issueState, verifySession } from "../src/auth/session.js";
import type { GithubOAuthClient } from "../src/auth/github.js";
import type { DbClient } from "../src/db/client.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");
const SECRET = "test-session-secret-0123456789";

const fakeGithub: GithubOAuthClient = {
  exchangeCode: async (code: string) => `gh_access_${code}`,
  fetchUser: async () => ({ id: 12345, login: "octocat", name: "The Octocat" }),
};

let db: DbClient;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let app: any;

beforeEach(async () => {
  db = createSqliteClient();
  await db.execScript(schema);
  ({ app } = await createApp({ db, githubOAuth: fakeGithub, sessionSecret: SECRET }));
});

async function loginAndGetSession(): Promise<string> {
  const state = await issueState(SECRET, "nonce-1");
  const res = await request(app).get("/api/auth/github/callback").query({ code: "abc", state });
  expect(res.status).toBe(302);
  const loc = res.headers.location as string;
  expect(loc.startsWith("http://localhost:5173/#session=")).toBe(true);
  return decodeURIComponent(loc.split("#session=")[1]);
}

describe("GitHub OAuth 콜백", () => {
  it("유효한 state+code면 유저를 프로비저닝하고 세션을 발급해 프론트로 리다이렉트한다", async () => {
    const session = await loginAndGetSession();
    expect(await verifySession(session, SECRET)).toBe("github:12345");
    // 유저가 sugo_users에 실제로 생겼는지
    const rows = await db.query<{ id: string; display_name: string }>(
      "SELECT id, display_name FROM sugo_users WHERE id = ?",
      ["github:12345"]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].display_name).toBe("The Octocat");
  });

  it("state가 위조/누락이면 400 (CSRF 방지)", async () => {
    const bad = await request(app).get("/api/auth/github/callback").query({ code: "abc", state: "forged" });
    expect(bad.status).toBe(400);
    const missing = await request(app).get("/api/auth/github/callback").query({ code: "abc" });
    expect(missing.status).toBe(400);
  });
});

describe("API 토큰 관리 (웹 세션 필요)", () => {
  it("세션 없이 토큰 발급 시도하면 401", async () => {
    const res = await request(app).post("/api/tokens").send({ name: "cli" });
    expect(res.status).toBe(401);
  });

  it("세션으로 토큰을 발급하면 평문을 1회 주고, 목록엔 힌트만 나온다", async () => {
    const session = await loginAndGetSession();

    const created = await request(app).post("/api/tokens").set("Authorization", `Bearer ${session}`).send({ name: "cli" });
    expect(created.status).toBe(201);
    expect(created.body.token).toMatch(/^sugo_pat_/);
    const plaintext = created.body.token as string;

    const list = await request(app).get("/api/tokens").set("Authorization", `Bearer ${session}`);
    expect(list.status).toBe(200);
    expect(list.body.tokens).toHaveLength(1);
    expect(list.body.tokens[0].name).toBe("cli");
    expect(list.body.tokens[0].hint).toBe(plaintext.slice(-6));
    // 목록 응답에 평문 토큰이 절대 실리면 안 된다
    expect(JSON.stringify(list.body)).not.toContain(plaintext);
  });

  it("발급한 토큰은 본인만 폐기할 수 있고, 폐기하면 목록에서 사라진다", async () => {
    const session = await loginAndGetSession();
    const created = await request(app).post("/api/tokens").set("Authorization", `Bearer ${session}`).send({});
    const id = created.body.id as number;

    const del = await request(app).delete(`/api/tokens/${id}`).set("Authorization", `Bearer ${session}`);
    expect(del.status).toBe(200);
    expect(del.body.revoked).toBe(true);

    const list = await request(app).get("/api/tokens").set("Authorization", `Bearer ${session}`);
    expect(list.body.tokens).toHaveLength(0);
  });

  it("위조된 세션 토큰은 401", async () => {
    const res = await request(app).get("/api/tokens").set("Authorization", "Bearer not.a.valid.jwt");
    expect(res.status).toBe(401);
  });
});

describe("requireUser — 세션(웹)과 API 토큰(플러그인) 둘 다 데이터 라우트를 통과한다", () => {
  it("브라우저 세션 토큰으로 데이터 라우트(/api/workspaces)를 읽을 수 있다", async () => {
    const session = await loginAndGetSession();
    const res = await request(app).get("/api/workspaces").set("Authorization", `Bearer ${session}`);
    expect(res.status).toBe(200);
    expect(res.body.workspaces).toEqual([]);
  });

  it("발급받은 API 토큰으로도 같은 데이터 라우트를 읽을 수 있다", async () => {
    const session = await loginAndGetSession();
    const created = await request(app).post("/api/tokens").set("Authorization", `Bearer ${session}`).send({});
    const apiToken = created.body.token as string;
    const res = await request(app).get("/api/workspaces").set("Authorization", `Bearer ${apiToken}`);
    expect(res.status).toBe(200);
    expect(res.body.workspaces).toEqual([]);
  });

  it("자격증명 없으면 데이터 라우트는 401", async () => {
    await request(app).get("/api/workspaces").expect(401);
  });
});
