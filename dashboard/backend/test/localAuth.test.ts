import { SignJWT } from "jose";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { verifySession } from "../src/auth/session.js";
import type { DbClient } from "../src/db/client.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");
const SECRET = "local-test-session-secret";
let db: DbClient;

beforeEach(async () => {
  db = createSqliteClient();
  await db.execScript(schema);
});

describe("GET /api/auth/local", () => {
  it("local mode에서는 사용자를 만들고 서명된 세션으로 callback한다", async () => {
    const { app } = await createApp({
      db,
      sessionSecret: SECRET,
      frontendUrl: "http://localhost:5175",
      localDev: { enabled: true, userId: "me", displayName: "Local Me" },
    });

    const res = await request(app).get("/api/auth/local");
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^http:\/\/localhost:5175\/auth\/callback#session=/);
    const token = decodeURIComponent((res.headers.location as string).split("#session=")[1]);
    expect(await verifySession(token, SECRET)).toBe("me");
    expect(await db.query("SELECT id FROM sugo_users WHERE id = ?", ["me"])).toHaveLength(1);
  });

  it("local mode가 꺼져 있으면 라우트 자체가 노출되지 않는다", async () => {
    const { app } = await createApp({
      db,
      sessionSecret: SECRET,
      localDev: { enabled: false, userId: "me", displayName: "Local Me" },
    });
    await request(app).get("/api/auth/local").expect(404);
  });
  it("renews the existing local browser login without navigating; rejects automation tokens and other users", async () => {
    const { app } = await createApp({ db, sessionSecret: SECRET, localDev: { enabled: true, userId: "me", displayName: "Me" } });
    const legacy = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("me").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
    const response = await request(app).get("/api/auth/local/session").set("Authorization", `Bearer ${legacy}`).expect(200);
    expect(await verifySession(response.body.session, SECRET)).toBe("me");
    expect(response.body).toMatchObject({ userId: "me", authSource: "local" });
    const other = await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject("other").setExpirationTime("1h").sign(new TextEncoder().encode(SECRET));
    await request(app).get("/api/auth/local/session").set("Authorization", `Bearer ${other}`).expect(403);
    await request(app).get("/api/auth/local/session").set("Authorization", "Bearer sugo_pat_automation").expect(401);
  });

});
