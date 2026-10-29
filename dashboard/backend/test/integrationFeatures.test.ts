import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { loadIntegrationFeatures, saveIntegrationFeatures } from "../src/services/integrationFeatures.js";
import { featureGatedRefresh } from "../src/services/contextAutoRefreshService.js";
import type { DbClient } from "../src/db/client.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");
const secret = "s".repeat(32);
let dir: string;
let db: DbClient;
let path: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "sugo-features-"));
  path = join(dir, "integration-features.json");
  db = createSqliteClient();
  await db.execScript(schema);
});

afterEach(async () => {
  await db.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("외부 연동 사용 설정", () => {
  it("처음 쓰는 사용자는 AWS, PR, APM이 모두 꺼져 있다", async () => {
    expect(await loadIntegrationFeatures(path, db, "me")).toEqual({ aws: false, pr: false, apm: false });
  });

  it("설정 파일이 없을 때 이미 연결해 둔 기능은 켜진 상태로 시작한다", async () => {
    await db.exec("INSERT INTO user_aws_context_accounts (user_id, name, profile, region, account_id, principal_arn, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", ["me", "dev", "dev", "ap-northeast-2", "1".repeat(12), "arn", "2026-10-29"]);
    await db.exec("INSERT INTO user_pinpoint_context (user_id, base_url, updated_at) VALUES (?, ?, ?)", ["me", "https://apm.example.com", "2026-10-29"]);

    expect(await loadIntegrationFeatures(path, db, "me")).toEqual({ aws: true, pr: false, apm: true });
    expect(await loadIntegrationFeatures(path, db, "other")).toEqual({ aws: false, pr: false, apm: false });
  });

  it("저장한 값은 연결 여부와 상관없이 그대로 쓴다", async () => {
    const { app } = await createApp({ db, sessionSecret: secret, integrationFeaturesPath: path, localDev: { enabled: true, userId: "me", displayName: "Me" } });
    const login = await request(app).get("/api/auth/local");
    const session = decodeURIComponent(String(login.headers.location).split("session=")[1]);
    const auth = { Authorization: `Bearer ${session}` };

    const saved = await request(app).put("/api/integration-features").set(auth).send({ aws: false, pr: true, apm: false });
    expect(saved.body).toEqual({ aws: false, pr: true, apm: false });
    expect((await request(app).get("/api/integration-features").set(auth)).body).toEqual({ aws: false, pr: true, apm: false });
    expect((await request(app).put("/api/integration-features").set(auth).send({ aws: "yes" })).status).toBe(400);
  });
});

describe("꺼진 기능의 자동 갱신", () => {
  it("끈 기능은 조회하지 않고, 켠 기능만 조회한다", async () => {
    await saveIntegrationFeatures(path, { aws: false, pr: false, apm: true });
    const called: string[] = [];
    await featureGatedRefresh(path, db, "aws", async (userId) => called.push(`aws:${userId}`))("me");
    await featureGatedRefresh(path, db, "apm", async (userId) => called.push(`apm:${userId}`))("me");
    expect(called).toEqual(["apm:me"]);
  });
});
