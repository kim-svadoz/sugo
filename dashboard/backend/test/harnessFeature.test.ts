import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import type { DbClient } from "../src/db/client.js";

const secret = "s".repeat(32);
const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");
let dir: string;
let db: DbClient;

beforeEach(async () => { dir = mkdtempSync(join(tmpdir(), "sugo-harness-feature-api-")); db = createSqliteClient(); await db.execScript(schema); });
afterEach(async () => { await db.close(); rmSync(dir, { recursive: true, force: true }); });

describe("하네스 전역 설정 API", () => {
  it("기본값은 켜짐이고 변경은 플러그인 엔진 결과를 반환한다", async () => {
    const calls: boolean[] = [];
    const { app } = await createApp({
      db, sessionSecret: secret, harnessFeaturePath: join(dir, "harness-feature.json"),
      harnessFeatureUpdater: async (enabled) => { calls.push(enabled); return { enabled, projectCount: 3 }; },
      localDev: { enabled: true, userId: "me", displayName: "Me" },
    });
    const login = await request(app).get("/api/auth/local");
    const auth = { Authorization: `Bearer ${decodeURIComponent(String(login.headers.location).split("session=")[1])}` };
    expect((await request(app).get("/api/harness-feature").set(auth)).body).toEqual({ enabled: true });
    const response = await request(app).put("/api/harness-feature").set(auth).send({ enabled: false });
    expect(response.body).toEqual({ enabled: false, projectCount: 3 });
    expect(calls).toEqual([false]);
  });
});
