import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

async function freshApp() {
  const db = createSqliteClient();
  await db.execScript(schema);
  const { app } = await createApp(db);
  return { app, db };
}

interface CanvasRow {
  id: string;
  level: string;
  status: string;
  depends_on: string | null;
  manual_status: string | null;
  pos_x: number | null;
  pos_y: number | null;
}

async function fetchNodes(db: Awaited<ReturnType<typeof createSqliteClient>>) {
  const rows = await db.query<CanvasRow>(
    "SELECT id, level, status, depends_on, manual_status, pos_x, pos_y FROM sugo_canvas_nodes ORDER BY id"
  );
  return rows;
}

describe("POST /api/sync/canvas — 설계안 적대적 코퍼스 (실제 DB 위에서)", () => {
  it("반드시 지켜야: depends_on은 최초 1회만 seed된다", async () => {
    const { app, db } = await freshApp();
    await request(app)
      .post("/api/sync/canvas")
      .send({
        userId: "u1",
        workspaceName: "ws1",
        nodes: [{ id: "t1", title: "T1", level: "task", status: "pending", dependsOn: ["t0"] }],
      })
      .expect(200);

    // dashboard "owns" ordering after the initial seed: reorder manually via raw SQL
    // (simulating what the canvas mutation routes will do in a later stage)
    await db.exec("UPDATE sugo_canvas_nodes SET depends_on = ? WHERE id = ?", [JSON.stringify(["manual-dep"]), "t1"]);

    // plugin re-syncs with a *different* dependsOn - must NOT overwrite the manual edit
    await request(app)
      .post("/api/sync/canvas")
      .send({
        userId: "u1",
        workspaceName: "ws1",
        nodes: [{ id: "t1", title: "T1 updated", level: "task", status: "in_progress", dependsOn: ["t9"] }],
      })
      .expect(200);

    const rows = await fetchNodes(db);
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].depends_on!)).toEqual(["manual-dep"]);
    expect(rows[0].status).toBe("in_progress"); // content fields DO update
    await db.close();
  });

  it("반드시 막아야: sync가 manual_status/pos_x/pos_y를 덮으면 안 된다", async () => {
    const { app, db } = await freshApp();
    await request(app)
      .post("/api/sync/canvas")
      .send({
        userId: "u1",
        workspaceName: "ws1",
        nodes: [{ id: "t1", title: "T1", level: "task", status: "pending" }],
      })
      .expect(200);

    // dashboard marks it manually done and repositions it
    await db.exec(
      "UPDATE sugo_canvas_nodes SET manual_status='done', manual_by='dashboard-user', pos_x=100, pos_y=200 WHERE id='t1'"
    );

    // plugin re-syncs (still says pending) - manual override must survive
    await request(app)
      .post("/api/sync/canvas")
      .send({
        userId: "u1",
        workspaceName: "ws1",
        nodes: [{ id: "t1", title: "T1", level: "task", status: "pending" }],
      })
      .expect(200);

    const rows = await fetchNodes(db);
    expect(rows[0].manual_status).toBe("done");
    expect(rows[0].pos_x).toBe(100);
    expect(rows[0].pos_y).toBe(200);
    await db.close();
  });

  it("반드시 막아야: replace가 수동 생성 workstream 그룹까지 지우면 안 된다", async () => {
    const { app, db } = await freshApp();
    await request(app)
      .post("/api/sync/canvas")
      .send({
        userId: "u1",
        workspaceName: "ws1",
        nodes: [{ id: "t1", title: "T1", level: "task", status: "pending" }],
      })
      .expect(200);

    // dashboard manually creates a workstream grouping (not from the plugin)
    await db.exec(
      "INSERT INTO sugo_canvas_nodes (id, user_id, workspace_name, title, level, status) VALUES ('ws-manual','u1','ws1','Manual Group','workstream','pending')"
    );

    // plugin re-syncs without mentioning the manual workstream at all
    await request(app)
      .post("/api/sync/canvas")
      .send({
        userId: "u1",
        workspaceName: "ws1",
        nodes: [{ id: "t1", title: "T1", level: "task", status: "in_progress" }],
      })
      .expect(200);

    const rows = await fetchNodes(db);
    expect(rows.map((r) => r.id)).toEqual(["t1", "ws-manual"]);
    await db.close();
  });

  it("반드시 지켜야: payload에서 빠진 non-workstream 노드는 삭제되고, 참조하던 depends_on도 청소된다", async () => {
    const { app, db } = await freshApp();
    await request(app)
      .post("/api/sync/canvas")
      .send({
        userId: "u1",
        workspaceName: "ws1",
        nodes: [
          { id: "t1", title: "T1", level: "task", status: "done" },
          { id: "t2", title: "T2", level: "task", status: "pending", dependsOn: ["t1"] },
        ],
      })
      .expect(200);

    // t1 disappears from the next sync (e.g. dropped/renamed by the plugin)
    await request(app)
      .post("/api/sync/canvas")
      .send({
        userId: "u1",
        workspaceName: "ws1",
        nodes: [{ id: "t2", title: "T2", level: "task", status: "pending", dependsOn: ["t1"] }],
      })
      .expect(200);

    const rows = await fetchNodes(db);
    expect(rows.map((r) => r.id)).toEqual(["t2"]);
    expect(JSON.parse(rows[0].depends_on!)).toEqual([]); // dangling dep on deleted t1 cleaned
    await db.close();
  });

  it("반드시 지켜야: 신규 노드는 depends_on을 그대로 seed한다", async () => {
    const { app, db } = await freshApp();
    await request(app)
      .post("/api/sync/canvas")
      .send({
        userId: "u1",
        workspaceName: "ws1",
        nodes: [
          { id: "t1", title: "T1", level: "task", status: "done" },
          { id: "t2", title: "T2", level: "task", status: "pending", dependsOn: ["t1"] },
        ],
      })
      .expect(200);
    const rows = await fetchNodes(db);
    const t2 = rows.find((r) => r.id === "t2")!;
    expect(JSON.parse(t2.depends_on!)).toEqual(["t1"]);
    await db.close();
  });

  it("work_result/lineage는 best-effort로 실려서 저장된다", async () => {
    const { app, db } = await freshApp();
    await request(app)
      .post("/api/sync/canvas")
      .send({
        userId: "u1",
        workspaceName: "ws1",
        nodes: [
          {
            id: "t1",
            title: "T1",
            level: "task",
            status: "done",
            workResult: { startedAt: "2026-01-01", summary: "did it", files: [] },
            lineage: [{ version: 0, completedAt: "2026-01-01" }],
          },
        ],
      })
      .expect(200);
    const rows = await db.query<{ work_result: string; lineage: string }>(
      "SELECT work_result, lineage FROM sugo_canvas_nodes WHERE id='t1'"
    );
    expect(JSON.parse(rows[0].work_result).summary).toBe("did it");
    expect(JSON.parse(rows[0].lineage)).toEqual([{ version: 0, completedAt: "2026-01-01" }]);
    await db.close();
  });
});
