import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

async function freshApp() {
  const db = createSqliteClient();
  await db.execScript(schema);
  const { app } = await createApp(db);
  const auth = await seedUserToken(db, "u1");
  return { app, db, auth };
}

describe("POST /api/activity/ingest + GET /api/activity/stream", () => {
  it("ingests events and streams them back most-recent-first", async () => {
    const { app, auth } = await freshApp();
    await request(app)
      .post("/api/activity/ingest")
      .set("Authorization", auth)
      .send({ userId: "u1", workspace: "ws1", ts: "2026-01-01T00:00:00.000Z", message: "first" })
      .expect(200);
    await request(app)
      .post("/api/activity/ingest")
      .set("Authorization", auth)
      .send({
        userId: "u1",
        workspace: "ws1",
        ts: "2026-01-01T00:00:01.000Z",
        message: "second",
        agent: "CODE",
        handoffTo: "TEST",
        eventType: "HANDOFF",
      })
      .expect(200);

    const res = await request(app).get("/api/activity/stream").set("Authorization", auth).query({ workspace: "ws1" }).expect(200);
    expect(res.body.events).toHaveLength(2);
    expect(res.body.events[0].message).toBe("second");
    expect(res.body.events[0].handoff_to).toBe("TEST");
    expect(res.body.events[1].message).toBe("first");
  });

  it("filters by workspace when provided", async () => {
    const { app, auth } = await freshApp();
    await request(app).post("/api/activity/ingest").set("Authorization", auth).send({ userId: "u1", workspace: "ws1", message: "a" });
    await request(app).post("/api/activity/ingest").set("Authorization", auth).send({ userId: "u1", workspace: "ws2", message: "b" });

    const res = await request(app).get("/api/activity/stream").set("Authorization", auth).query({ workspace: "ws1" }).expect(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].message).toBe("a");
  });

  it("401s without an API token (공개 SaaS 인증 강제)", async () => {
    const { app } = await freshApp();
    await request(app).get("/api/activity/stream").expect(401);
    await request(app).post("/api/activity/ingest").send({ userId: "u1", workspace: "ws1", message: "x" }).expect(401);
  });

  it("400s on invalid ingest body", async () => {
    const { app, auth } = await freshApp();
    await request(app).post("/api/activity/ingest").set("Authorization", auth).send({ userId: "u1" }).expect(400);
  });
});
