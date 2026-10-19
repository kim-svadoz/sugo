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

describe("POST /api/sync/user", () => {
  it("creates a user and is idempotent on re-sync", async () => {
    const { app, db, auth } = await freshApp();
    await request(app).post("/api/sync/user").set("Authorization", auth).send({ userId: "u1", displayName: "Kim" }).expect(200);
    await request(app).post("/api/sync/user").set("Authorization", auth).send({ userId: "u1", displayName: "Kim2" }).expect(200);
    const rows = await db.query<{ display_name: string }>("SELECT display_name FROM sugo_users WHERE id='u1'");
    expect(rows).toEqual([{ display_name: "Kim2" }]);
    await db.close();
  });

  it("401s without an API token (공개 SaaS 인증 강제)", async () => {
    const { app } = await freshApp();
    await request(app).post("/api/sync/user").send({ userId: "u1" }).expect(401);
  });
});

describe("POST /api/sync/workspace — projects replace semantics", () => {
  it("replaces the project list and marks gitSyncedProjects", async () => {
    const { app, db, auth } = await freshApp();
    await request(app)
      .post("/api/sync/workspace")
      .set("Authorization", auth)
      .send({ userId: "u1", name: "ws1", projects: ["C:/a", "C:/b"], gitSyncedProjects: ["C:/a"] })
      .expect(200);

    let rows = await db.query<{ project_path: string; git_synced: number }>(
      "SELECT project_path, git_synced FROM sugo_workspace_projects wp JOIN sugo_workspaces w ON w.id = wp.workspace_id WHERE w.user_id='u1' AND w.name='ws1' ORDER BY project_path"
    );
    expect(rows).toEqual([
      { project_path: "C:/a", git_synced: 1 },
      { project_path: "C:/b", git_synced: 0 },
    ]);

    // re-sync with "C:/b" dropped and "C:/c" added
    await request(app)
      .post("/api/sync/workspace")
      .set("Authorization", auth)
      .send({ userId: "u1", name: "ws1", projects: ["C:/a", "C:/c"], gitSyncedProjects: [] })
      .expect(200);

    rows = await db.query<{ project_path: string; git_synced: number }>(
      "SELECT project_path, git_synced FROM sugo_workspace_projects wp JOIN sugo_workspaces w ON w.id = wp.workspace_id WHERE w.user_id='u1' AND w.name='ws1' ORDER BY project_path"
    );
    expect(rows).toEqual([
      { project_path: "C:/a", git_synced: 0 },
      { project_path: "C:/c", git_synced: 0 },
    ]);
    await db.close();
  });
});

describe("DELETE /api/sync/workspace", () => {
  // 기본 삭제는 soft다. 프로젝트 연결은 복구를 위해 남아 있어야 하고,
  // 실제 cascade는 purge에서만 일어난다.
  it("기본(soft) 삭제는 workspace_projects를 남긴다(복구 가능해야 하므로)", async () => {
    const { app, db, auth } = await freshApp();
    await request(app).post("/api/sync/workspace").set("Authorization", auth).send({ userId: "u1", name: "ws1", projects: ["C:/a"] }).expect(200);
    await request(app).delete("/api/sync/workspace").set("Authorization", auth).send({ userId: "u1", name: "ws1" }).expect(200);
    expect(await db.query("SELECT * FROM sugo_workspace_projects")).toHaveLength(1);
    await db.close();
  });

  it("purge:true면 workspace_projects까지 cascade된다", async () => {
    const { app, db, auth } = await freshApp();
    await request(app).post("/api/sync/workspace").set("Authorization", auth).send({ userId: "u1", name: "ws1", projects: ["C:/a"] }).expect(200);
    await request(app).delete("/api/sync/workspace").set("Authorization", auth).send({ userId: "u1", name: "ws1", purge: true }).expect(200);
    expect(await db.query("SELECT * FROM sugo_workspace_projects")).toEqual([]);
    await db.close();
  });
});

describe("POST /api/sync/task + DELETE", () => {
  it("upserts then deletes a task", async () => {
    const { app, db, auth } = await freshApp();
    await request(app)
      .post("/api/sync/task")
      .set("Authorization", auth)
      .send({ userId: "u1", workspaceName: "ws1", id: "t1", title: "Task 1", status: "in_progress" })
      .expect(200);
    let rows = await db.query("SELECT title, status FROM sugo_tasks WHERE id='t1'");
    expect(rows).toEqual([{ title: "Task 1", status: "in_progress" }]);

    await request(app).delete("/api/sync/task").set("Authorization", auth).send({ userId: "u1", workspaceName: "ws1", id: "t1" }).expect(200);
    rows = await db.query("SELECT * FROM sugo_tasks WHERE id='t1'");
    expect(rows).toEqual([]);
    await db.close();
  });
});

describe("POST /api/sync/history — metrics round-trip", () => {
  it("stores estimation metrics and JSON columns", async () => {
    const { app, db, auth } = await freshApp();
    await request(app)
      .post("/api/sync/history")
      .set("Authorization", auth)
      .send({
        userId: "u1",
        workspaceName: "ws1",
        id: "h1",
        taskTitle: "Task 1",
        summary: "did stuff",
        keyDecisions: ["use X"],
        filesChanged: [{ path: "a.ts", change: "added" }],
        estimatedHumanHours: 2.5,
        aiExecutionMinutes: 12,
      })
      .expect(200);
    const rows = await db.query<{ key_decisions: string; estimated_human_hours: number }>(
      "SELECT key_decisions, estimated_human_hours FROM sugo_history WHERE id='h1'"
    );
    expect(JSON.parse(rows[0].key_decisions)).toEqual(["use X"]);
    expect(rows[0].estimated_human_hours).toBe(2.5);
    await db.close();
  });
});

describe("POST /api/sync/decision, /checkpoint, /workspace-meta", () => {
  it("all upsert correctly", async () => {
    const { app, db, auth } = await freshApp();
    await request(app)
      .post("/api/sync/decision")
      .set("Authorization", auth)
      .send({ userId: "u1", workspaceName: "ws1", id: "d1", title: "Use Postgres", status: "accepted" })
      .expect(200);
    await request(app)
      .post("/api/sync/checkpoint")
      .set("Authorization", auth)
      .send({ userId: "u1", workspaceName: "ws1", id: "CP-001", title: "watch out", checklist: ["a", "b"] })
      .expect(200);
    await request(app)
      .post("/api/sync/workspace-meta")
      .set("Authorization", auth)
      .send({ userId: "u1", workspaceName: "ws1", goldenRule: "test first", checkpointsVersion: 3 })
      .expect(200);

    const decisions = await db.query("SELECT title FROM sugo_decisions WHERE id='d1'");
    expect(decisions).toEqual([{ title: "Use Postgres" }]);
    const checkpoints = await db.query("SELECT title FROM sugo_checkpoints WHERE id='CP-001'");
    expect(checkpoints).toEqual([{ title: "watch out" }]);
    const meta = await db.query("SELECT golden_rule, checkpoints_version FROM sugo_workspace_meta");
    expect(meta).toEqual([{ golden_rule: "test first", checkpoints_version: 3 }]);
    await db.close();
  });
});

describe("plugin-version GET/POST", () => {
  it("returns null before sync, then the synced version", async () => {
    const { app, auth } = await freshApp();
    let res = await request(app).get("/api/sync/plugin-version").set("Authorization", auth).expect(200);
    expect(res.body).toEqual({ version: null });

    await request(app).post("/api/sync/plugin-version").set("Authorization", auth).send({ userId: "u1", version: "2.68.1" }).expect(200);
    res = await request(app).get("/api/sync/plugin-version").set("Authorization", auth).expect(200);
    expect(res.body).toEqual({ version: "2.68.1" });
  });
});

describe("POST /api/sync/bulk", () => {
  it("dispatches every entity array in one call", async () => {
    const { app, db, auth } = await freshApp();
    await request(app)
      .post("/api/sync/bulk")
      .set("Authorization", auth)
      .send({
        users: [{ userId: "u1" }],
        workspaces: [{ userId: "u1", name: "ws1", projects: ["C:/a"] }],
        tasks: [{ userId: "u1", workspaceName: "ws1", id: "t1", title: "T" }],
        decisions: [{ userId: "u1", workspaceName: "ws1", id: "d1", title: "D" }],
      })
      .expect(200);

    const tasks = await db.query("SELECT id FROM sugo_tasks");
    const decisions = await db.query("SELECT id FROM sugo_decisions");
    expect(tasks).toEqual([{ id: "t1" }]);
    expect(decisions).toEqual([{ id: "d1" }]);
    await db.close();
  });
});
