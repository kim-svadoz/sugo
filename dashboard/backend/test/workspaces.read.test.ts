import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

async function seededApp() {
  const db = createSqliteClient();
  await db.execScript(schema);
  const { app } = await createApp(db);
  const auth = await seedUserToken(db, "u1");

  await request(app)
    .post("/api/sync/workspace").set("Authorization", auth)
    .send({ userId: "u1", name: "ws1", projects: ["C:/a"], gitSyncedProjects: ["C:/a"] });
  await request(app)
    .post("/api/sync/task").set("Authorization", auth)
    .send({ userId: "u1", workspaceName: "ws1", id: "t1", title: "Task 1", status: "in_progress" });
  await request(app)
    .post("/api/sync/task").set("Authorization", auth)
    .send({ userId: "u1", workspaceName: "ws1", id: "t2", title: "Task 2", status: "done" });
  await request(app)
    .post("/api/sync/roadmap").set("Authorization", auth)
    .send({
      userId: "u1",
      workspaceName: "ws1",
      nodes: [
        { id: "t1", title: "Task 1", level: "task", status: "in_progress" },
        { id: "t2", title: "Task 2", level: "task", status: "done" },
      ],
    });
  await request(app)
    .post("/api/sync/history").set("Authorization", auth)
    .send({ userId: "u1", workspaceName: "ws1", id: "h1", taskTitle: "Task 2", summary: "finished the thing" });
  await request(app)
    .post("/api/sync/decision").set("Authorization", auth)
    .send({ userId: "u1", workspaceName: "ws1", id: "d1", title: "Use SQLite locally" });
  await request(app)
    .post("/api/sync/checkpoint").set("Authorization", auth)
    .send({ userId: "u1", workspaceName: "ws1", id: "CP-001", title: "watch out" });

  return { app, db, auth };
}

describe("GET /api/workspaces", () => {
  it("lists workspaces with task counts and roadmap counts", async () => {
    const { app, auth } = await seededApp();
    const res = await request(app).get("/api/workspaces").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(res.body.workspaces).toHaveLength(1);
    const ws = res.body.workspaces[0];
    expect(ws.name).toBe("ws1");
    expect(ws.projects).toEqual([{ project_path: "C:/a", git_synced: 1 }]);
    expect(ws.taskCounts).toEqual({ pending: 0, in_progress: 1, done: 1, archived: 0 });
    expect(ws.roadmap).toEqual({ total: 2, done: 1, active: 1 });
  });

  it("401s without an API token", async () => {
    const { app } = await seededApp();
    await request(app).get("/api/workspaces").expect(401);
  });
});

describe("GET /api/workspaces/recent-history and /search", () => {
  it("returns recent history entries", async () => {
    const { app, auth } = await seededApp();
    const res = await request(app).get("/api/workspaces/recent-history").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].summary).toBe("finished the thing");
  });

  it("searches by task title/summary", async () => {
    const { app, auth } = await seededApp();
    const res = await request(app)
      .get("/api/workspaces/search")
      .query({ userId: "u1", q: "finished" }).set("Authorization", auth)
      .expect(200);
    expect(res.body.results).toHaveLength(1);
  });
});

describe("GET /api/workspaces/checkpoint-sync", () => {
  it("returns all checkpoints across workspaces for the user", async () => {
    const { app, auth } = await seededApp();
    const res = await request(app).get("/api/workspaces/checkpoint-sync").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(res.body.checkpoints).toEqual([
      expect.objectContaining({ id: "CP-001", workspace_name: "ws1", title: "watch out" }),
    ]);
  });
});

describe("GET /api/workspaces/:name/{decisions,history,checkpoints,tasks,roadmap}", () => {
  it("returns per-workspace data", async () => {
    const { app, auth } = await seededApp();
    const decisions = await request(app).get("/api/workspaces/ws1/decisions").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(decisions.body.decisions).toHaveLength(1);

    const tasks = await request(app).get("/api/workspaces/ws1/tasks").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(tasks.body.tasks).toHaveLength(2);

    const roadmap = await request(app).get("/api/workspaces/ws1/roadmap").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(roadmap.body.nodes).toHaveLength(2);
  });
});

describe("checkpoint CRUD via dashboard (§3.3)", () => {
  it("creates, updates, and deletes a checkpoint", async () => {
    const { app, db, auth } = await seededApp();
    await request(app)
      .post("/api/workspaces/ws1/checkpoints")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ id: "CP-002", title: "new one" })
      .expect(200);

    await request(app)
      .put("/api/workspaces/ws1/checkpoints/CP-002")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ title: "updated title" })
      .expect(200);
    let rows = await db.query("SELECT title FROM sugo_checkpoints WHERE id='CP-002'");
    expect(rows).toEqual([{ title: "updated title" }]);

    await request(app).delete("/api/workspaces/ws1/checkpoints/CP-002").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    rows = await db.query("SELECT * FROM sugo_checkpoints WHERE id='CP-002'");
    expect(rows).toEqual([]);
  });
});
