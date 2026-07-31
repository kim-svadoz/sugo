import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

async function appWithNodes(nodes: Array<{ id: string; level: string; status?: string; dependsOn?: string[] }>) {
  const db = createSqliteClient();
  await db.execScript(schema);
  const { app } = await createApp(db);
  const auth = await seedUserToken(db, "u1");
  await request(app)
    .post("/api/sync/roadmap").set("Authorization", auth)
    .send({
      userId: "u1",
      workspaceName: "ws1",
      nodes: nodes.map((n) => ({ id: n.id, title: n.id, level: n.level, status: n.status ?? "pending", dependsOn: n.dependsOn })),
    });
  return { app, db, auth };
}

describe("POST/DELETE /api/workspaces/:name/roadmap/link — fail-closed", () => {
  it("links two task nodes", async () => {
    const { app, db, auth } = await appWithNodes([{ id: "a", level: "task" }, { id: "b", level: "task" }]);
    await request(app)
      .post("/api/workspaces/ws1/roadmap/link")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ from: "a", to: "b" })
      .expect(200);
    const rows = await db.query<{ depends_on: string }>("SELECT depends_on FROM sugo_roadmap_nodes WHERE id='a'");
    expect(JSON.parse(rows[0].depends_on)).toEqual(["b"]);
  });

  it("반드시 거부: non-task 레벨끼리는 링크 불가", async () => {
    const { app, auth } = await appWithNodes([
      { id: "spec1", level: "spec" },
      { id: "b", level: "task" },
    ]);
    const res = await request(app)
      .post("/api/workspaces/ws1/roadmap/link")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ from: "spec1", to: "b" })
      .expect(409);
    expect(res.body.error).toBe("LINK_REQUIRES_TASK_LEVEL");
  });

  it("반드시 거부: 사이클을 만드는 링크", async () => {
    const { app, auth } = await appWithNodes([
      { id: "a", level: "task", dependsOn: ["b"] },
      { id: "b", level: "task" },
    ]);
    const res = await request(app)
      .post("/api/workspaces/ws1/roadmap/link")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ from: "b", to: "a" })
      .expect(409);
    expect(res.body.error).toBe("CYCLE");
  });

  it("unlink removes the dependency", async () => {
    const { app, db, auth } = await appWithNodes([{ id: "a", level: "task", dependsOn: ["b"] }, { id: "b", level: "task" }]);
    await request(app)
      .delete("/api/workspaces/ws1/roadmap/link")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ from: "a", to: "b" })
      .expect(200);
    const rows = await db.query<{ depends_on: string }>("SELECT depends_on FROM sugo_roadmap_nodes WHERE id='a'");
    expect(JSON.parse(rows[0].depends_on)).toEqual([]);
  });
});

describe("POST /api/workspaces/:name/roadmap/group", () => {
  it("creates a workstream and reparents members", async () => {
    const { app, db, auth } = await appWithNodes([{ id: "a", level: "task" }, { id: "b", level: "task" }]);
    await request(app)
      .post("/api/workspaces/ws1/roadmap/group")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ groupId: "grp1", title: "Group 1", members: ["a", "b"], sequential: true })
      .expect(200);

    const group = await db.query("SELECT level FROM sugo_roadmap_nodes WHERE id='grp1'");
    expect(group).toEqual([{ level: "workstream" }]);
    const members = await db.query("SELECT id, parent FROM sugo_roadmap_nodes WHERE id IN ('a','b') ORDER BY id");
    expect(members).toEqual([
      { id: "a", parent: "grp1" },
      { id: "b", parent: "grp1" },
    ]);
    const bDeps = await db.query<{ depends_on: string }>("SELECT depends_on FROM sugo_roadmap_nodes WHERE id='b'");
    expect(JSON.parse(bDeps[0].depends_on)).toEqual(["a"]); // sequential chain
  });

  it("deleting a group clears parent on former members but keeps them", async () => {
    const { app, db, auth } = await appWithNodes([{ id: "a", level: "task" }]);
    await request(app)
      .post("/api/workspaces/ws1/roadmap/group")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ groupId: "grp1", title: "Group 1", members: ["a"] })
      .expect(200);
    await request(app).delete("/api/workspaces/ws1/roadmap/group/grp1").query({ userId: "u1" }).set("Authorization", auth).expect(200);

    const group = await db.query("SELECT * FROM sugo_roadmap_nodes WHERE id='grp1'");
    expect(group).toEqual([]);
    const a = await db.query("SELECT parent FROM sugo_roadmap_nodes WHERE id='a'");
    expect(a).toEqual([{ parent: null }]);
  });
});

describe("manual-status ownership survives plugin re-sync", () => {
  it("set/clear manual-status persist and are never overwritten by sync", async () => {
    const { app, db, auth } = await appWithNodes([{ id: "a", level: "task" }]);
    await request(app)
      .post("/api/workspaces/ws1/roadmap/manual-status")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "a", status: "done" })
      .expect(200);

    let rows = await db.query<{ manual_status: string; manual_by: string }>(
      "SELECT manual_status, manual_by FROM sugo_roadmap_nodes WHERE id='a'"
    );
    expect(rows[0]).toEqual({ manual_status: "done", manual_by: "u1" });

    // plugin re-syncs the same node as pending - manual override must survive
    await request(app)
      .post("/api/sync/roadmap").set("Authorization", auth)
      .send({ userId: "u1", workspaceName: "ws1", nodes: [{ id: "a", title: "a", level: "task", status: "pending" }] });
    rows = await db.query("SELECT manual_status FROM sugo_roadmap_nodes WHERE id='a'");
    expect(rows[0].manual_status).toBe("done");

    await request(app)
      .delete("/api/workspaces/ws1/roadmap/manual-status")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "a" })
      .expect(200);
    const cleared = await db.query("SELECT manual_status FROM sugo_roadmap_nodes WHERE id='a'");
    expect(cleared).toEqual([{ manual_status: null }]);
  });
});

describe("position mutation", () => {
  it("sets pos_x/pos_y and survives plugin re-sync", async () => {
    const { app, db, auth } = await appWithNodes([{ id: "a", level: "task" }]);
    await request(app)
      .post("/api/workspaces/ws1/roadmap/position")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "a", x: 12.5, y: 34.5 })
      .expect(200);

    await request(app)
      .post("/api/sync/roadmap").set("Authorization", auth)
      .send({ userId: "u1", workspaceName: "ws1", nodes: [{ id: "a", title: "a", level: "task", status: "in_progress" }] });

    const rows = await db.query<{ pos_x: number; pos_y: number }>("SELECT pos_x, pos_y FROM sugo_roadmap_nodes WHERE id='a'");
    expect(rows[0]).toEqual({ pos_x: 12.5, pos_y: 34.5 });
  });
});

describe("rename and parent mutations", () => {
  it("renames a node and sets its parent", async () => {
    const { app, db, auth } = await appWithNodes([{ id: "a", level: "task" }, { id: "ws-grp", level: "workstream" }]);
    await request(app)
      .post("/api/workspaces/ws1/roadmap/rename")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "a", title: "New Title" })
      .expect(200);
    await request(app)
      .post("/api/workspaces/ws1/roadmap/parent")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "a", parentId: "ws-grp" })
      .expect(200);

    const rows = await db.query("SELECT title, parent FROM sugo_roadmap_nodes WHERE id='a'");
    expect(rows).toEqual([{ title: "New Title", parent: "ws-grp" }]);
  });
});
