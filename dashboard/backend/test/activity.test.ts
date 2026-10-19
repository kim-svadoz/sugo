import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";
import { pruneExpiredActivityEvents } from "../src/services/activityService.js";

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

  it("replays queued plugin events that used the workspaceName field", async () => {
    const { app, auth } = await freshApp();
    await request(app)
      .post("/api/activity/ingest")
      .set("Authorization", auth)
      .send({ userId: "u1", workspaceName: "ws1", message: "queued completion", eventType: "COMPLETED" })
      .expect(200);

    const res = await request(app).get("/api/activity/stream").set("Authorization", auth).query({ workspace: "ws1" }).expect(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0].message).toBe("queued completion");
  });

  it("401s without an API token (인증 강제)", async () => {
    const { app } = await freshApp();
    await request(app).get("/api/activity/stream").expect(401);
    await request(app).post("/api/activity/ingest").send({ userId: "u1", workspace: "ws1", message: "x" }).expect(401);
  });

  it("400s on invalid ingest body", async () => {
    const { app, auth } = await freshApp();
    await request(app).post("/api/activity/ingest").set("Authorization", auth).send({ userId: "u1" }).expect(400);
  });
});

describe("live console retention", () => {
  it("removes only events older than 90 days", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    await db.exec(
      `INSERT INTO sugo_activity_events
       (user_id, workspace_name, ts, level, event_type, message)
       VALUES (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?)`,
      [
        "u1", "ws1", "2026-06-29 23:59:59.000", "INFO", "SYSTEM", "expired",
        "u1", "ws1", "2026-06-30 00:00:00.000", "INFO", "SYSTEM", "boundary",
        "u1", "ws1", "2026-09-27 00:00:00.000", "INFO", "SYSTEM", "recent",
      ],
    );

    const removed = await pruneExpiredActivityEvents(db, new Date("2026-09-28T00:00:00.000Z"));
    const remaining = await db.query<{ message: string }>("SELECT message FROM sugo_activity_events ORDER BY ts");

    expect(removed).toBe(1);
    expect(remaining.map((row) => row.message)).toEqual(["boundary", "recent"]);
  });
});
