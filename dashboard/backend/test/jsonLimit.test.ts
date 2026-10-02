import { expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { seedUserToken } from "./testAuth.js";

it("190KB reaches routing and over 10MiB returns explicit 413", async () => {
  const db = createSqliteClient(":memory:");
  try {
    const { app } = await createApp({ db });
    await request(app).post("/missing").send({ content: "x".repeat(190_000) }).expect(404);
    const response = await request(app).post("/api/sync/roadmap").send({ content: "x".repeat(10 * 1024 * 1024) }).expect(413);
    expect(response.body).toMatchObject({ error: "payload_too_large", limit: "10mb" });
    expect(response.body.message).toContain("10mb");
  } finally { await db.close(); }
});

it("large valid roadmap sync and compact completed task round-trip through authenticated API", async () => {
  // Keep backend tsc's root inside this package; Vitest loads the shared source at runtime.
  const serializerPath = "../../../sugo/src/dashboard/serialize.ts";
  const { serializeRoadmapSnapshot } = await import(serializerPath);
  const db = createSqliteClient();
  try {
    await db.execScript(readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8"));
    const { app } = await createApp({ db });
    const auth = await seedUserToken(db);
    await request(app).post("/api/sync/roadmap").set("Authorization", auth)
      .send({ userId: "u1", workspaceName: "ws", nodes: [{ id: "task-1", title: "Task", level: "task", status: "in_progress", note: "x".repeat(190_000) }] }).expect(200);
    const payload = serializeRoadmapSnapshot("u1", "ws", [{
      id: "task-1", title: "Task", level: "task", status: "done", dependsOn: [],
      note: "DONE", workResult: { summary: "동기화 완료", files: [{ path: "a.ts", change: "modified", content: "x".repeat(190_000), diff: "+added" }] },
    }]);
    await request(app).post("/api/sync/roadmap").set("Authorization", auth).send(payload).expect(200);
    const response = await request(app).get("/api/workspaces/ws/roadmap").set("Authorization", auth).expect(200);
    expect(response.body.nodes[0]).toMatchObject({ status: "done", note: "DONE", work_result: { summary: "동기화 완료", files: [{ path: "a.ts", change: "modified", additions: 1, deletions: 0 }] } });
    expect(response.body.nodes[0].work_result.files[0].content).toBeUndefined();
  } finally { await db.close(); }
});
