import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";
import { __resetDeletedAtColState } from "../src/services/syncService.js";
import { dropSubtree, restoreSubtree } from "../src/services/workspaceService.js";
import type { DbClient } from "../src/db/client.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

interface NodeSpec {
  id: string;
  level?: string;
  status?: string;
  parent?: string | null;
  manual?: string | null;
}

async function seed(db: DbClient, nodes: NodeSpec[]): Promise<void> {
  await db.exec("INSERT INTO sugo_users (id) VALUES ('u1')");
  for (const n of nodes) {
    await db.exec(
      "INSERT INTO sugo_roadmap_nodes (id, user_id, workspace_name, title, level, status, parent, manual_status) VALUES (?,?,?,?,?,?,?,?)",
      [n.id, "u1", "ws1", n.id, n.level ?? "task", n.status ?? "pending", n.parent ?? null, n.manual ?? null],
    );
  }
}

async function effective(db: DbClient): Promise<Record<string, string | null>> {
  const rows = await db.query<{ id: string; manual_status: string | null }>(
    "SELECT id, manual_status FROM sugo_roadmap_nodes WHERE user_id='u1' AND workspace_name='ws1' ORDER BY id",
  );
  return Object.fromEntries(rows.map((r) => [r.id, r.manual_status]));
}

async function fresh() {
  __resetDeletedAtColState();
  const db = createSqliteClient();
  await db.execScript(schema);
  return db;
}

/**
 * §7 폐기(discard) — **삭제가 아니라 `manual_status='dropped'` override.**
 * 실제 DELETE면 이력이 소실되고 되돌릴 수 없다. 폐기는 "안 할 일"이라는 판단일 뿐이라
 * 복구 가능해야 하고, 진행률 분모에서만 빠지면 된다.
 */
describe("§7 dropSubtree — BFS cascade", () => {
  it("루트와 전 자손에 dropped를 내린다", async () => {
    const db = await fresh();
    await seed(db, [
      { id: "spec-1", level: "spec", parent: null },
      { id: "run-1", level: "workstream", parent: "spec-1" },
      { id: "task-1", parent: "run-1" },
      { id: "req-1", level: "subtask", parent: "task-1" },
      { id: "other", parent: null },
    ]);

    const r = await dropSubtree(db, "u1", "ws1", "run-1", "tester");
    expect(r.ok).toBe(true);
    expect(r.affected).toEqual(["run-1", "task-1", "req-1"]);

    const eff = await effective(db);
    expect(eff["run-1"]).toBe("dropped");
    expect(eff["task-1"]).toBe("dropped");
    expect(eff["req-1"]).toBe("dropped");
    expect(eff["spec-1"]).toBeNull(); // 조상은 안 건드린다
    expect(eff["other"]).toBeNull(); // 형제도 안 건드린다
    await db.close();
  });

  it("완료된 task의 하위면 폐기를 차단한다(이미 한 일을 없던 일로 만들지 않는다)", async () => {
    const db = await fresh();
    await seed(db, [
      { id: "run-1", level: "workstream", parent: null },
      { id: "task-1", parent: "run-1", status: "done" },
    ]);

    const r = await dropSubtree(db, "u1", "ws1", "run-1", "tester");
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("SUBTREE_HAS_DONE_TASK");
    expect(await effective(db)).toEqual({ "run-1": null, "task-1": null }); // 부분 적용 없음
    await db.close();
  });

  it("manual_status='done'인 하위도 완료로 보고 차단한다", async () => {
    const db = await fresh();
    await seed(db, [
      { id: "run-1", level: "workstream", parent: null },
      { id: "task-1", parent: "run-1", status: "pending", manual: "done" },
    ]);
    expect((await dropSubtree(db, "u1", "ws1", "run-1", "t")).errorCode).toBe("SUBTREE_HAS_DONE_TASK");
    await db.close();
  });

  it("사이클이 있어도 무한루프에 빠지지 않는다", async () => {
    const db = await fresh();
    await seed(db, [
      { id: "a", parent: "b" },
      { id: "b", parent: "a" },
    ]);
    const r = await dropSubtree(db, "u1", "ws1", "a", "t");
    expect(r.ok).toBe(true);
    expect(r.affected.sort()).toEqual(["a", "b"]);
    await db.close();
  });

  it("존재하지 않는 노드는 not-found", async () => {
    const db = await fresh();
    await seed(db, [{ id: "a" }]);
    expect((await dropSubtree(db, "u1", "ws1", "nope", "t")).errorCode).toBe("NODE_NOT_FOUND");
    await db.close();
  });

  it("다른 유저·워크스페이스 노드는 cascade에 안 걸린다", async () => {
    const db = await fresh();
    await seed(db, [{ id: "run-1", level: "workstream", parent: null }]);
    await db.exec("INSERT INTO sugo_users (id) VALUES ('u2')");
    await db.exec(
      "INSERT INTO sugo_roadmap_nodes (id, user_id, workspace_name, title, level, status, parent) VALUES ('task-x','u2','ws1','x','task','pending','run-1')",
    );

    await dropSubtree(db, "u1", "ws1", "run-1", "t");
    const rows = await db.query<{ manual_status: string | null }>("SELECT manual_status FROM sugo_roadmap_nodes WHERE user_id='u2'");
    expect(rows[0].manual_status).toBeNull();
    await db.close();
  });
});

describe("§7 restoreSubtree — dropped만 되돌린다", () => {
  it("dropped인 것만 NULL로 돌리고 다른 override는 보존한다", async () => {
    const db = await fresh();
    await seed(db, [
      { id: "run-1", level: "workstream", parent: null, manual: "dropped" },
      { id: "task-1", parent: "run-1", manual: "dropped" },
      { id: "task-2", parent: "run-1", manual: "done" }, // 사람이 손으로 완료 처리한 것
    ]);

    const r = await restoreSubtree(db, "u1", "ws1", "run-1");
    expect(r.ok).toBe(true);
    expect(r.affected.sort()).toEqual(["run-1", "task-1"]);

    const eff = await effective(db);
    expect(eff["run-1"]).toBeNull();
    expect(eff["task-1"]).toBeNull();
    expect(eff["task-2"]).toBe("done"); // 폐기와 무관한 override는 살아남는다
    await db.close();
  });

  it("drop → restore 왕복이 원상복구된다", async () => {
    const db = await fresh();
    await seed(db, [
      { id: "run-1", level: "workstream", parent: null },
      { id: "task-1", parent: "run-1" },
    ]);
    await dropSubtree(db, "u1", "ws1", "run-1", "t");
    await restoreSubtree(db, "u1", "ws1", "run-1");
    expect(await effective(db)).toEqual({ "run-1": null, "task-1": null });
    await db.close();
  });
});

describe("§7 진행률 분모에서 dropped 제외", () => {
  it("roadmap count가 dropped를 빼고 센다", async () => {
    const db = await fresh();
    await seed(db, [
      { id: "t1", status: "done" },
      { id: "t2", status: "pending" },
      { id: "t3", status: "pending", manual: "dropped" },
      { id: "t4", status: "dropped" },
    ]);
    const { app } = await createApp(db);
    const auth = await seedUserToken(db, "u1");
    await db.exec("INSERT INTO sugo_workspaces (user_id, name) VALUES ('u1','ws1')");

    const res = await request(app).get("/api/workspaces").set("Authorization", auth).expect(200);
    const ws = res.body.workspaces.find((w: { name: string }) => w.name === "ws1");
    expect(ws.roadmap.total).toBe(2); // t3(manual dropped) / t4(status dropped) 제외
    expect(ws.roadmap.done).toBe(1);
    await db.close();
  });
});

describe("§3.3 POST /:name/roadmap/drop · /restore", () => {
  async function app1() {
    const db = await fresh();
    await seed(db, [
      { id: "run-1", level: "workstream", parent: null },
      { id: "task-1", parent: "run-1" },
    ]);
    const { app } = await createApp(db);
    const auth = await seedUserToken(db, "u1");
    return { app, db, auth };
  }

  it("drop이 하위까지 dropped를 내리고 restore가 되돌린다", async () => {
    const { app, db, auth } = await app1();
    await request(app).post("/api/workspaces/ws1/roadmap/drop").set("Authorization", auth).send({ nodeId: "run-1" }).expect(200);
    expect(await effective(db)).toEqual({ "run-1": "dropped", "task-1": "dropped" });

    await request(app).post("/api/workspaces/ws1/roadmap/restore").set("Authorization", auth).send({ nodeId: "run-1" }).expect(200);
    expect(await effective(db)).toEqual({ "run-1": null, "task-1": null });
    await db.close();
  });

  it("완료 하위 폐기 시도는 409로 거부된다", async () => {
    const { app, db, auth } = await app1();
    await db.exec("UPDATE sugo_roadmap_nodes SET status='done' WHERE id='task-1'");
    const res = await request(app).post("/api/workspaces/ws1/roadmap/drop").set("Authorization", auth).send({ nodeId: "run-1" });
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe("SUBTREE_HAS_DONE_TASK");
    await db.close();
  });

  it("없는 노드는 404", async () => {
    const { app, db, auth } = await app1();
    const res = await request(app).post("/api/workspaces/ws1/roadmap/drop").set("Authorization", auth).send({ nodeId: "nope" });
    expect(res.status).toBe(404);
    await db.close();
  });

  it("nodeId 없이 부르면 400", async () => {
    const { app, db, auth } = await app1();
    await request(app).post("/api/workspaces/ws1/roadmap/drop").set("Authorization", auth).send({}).expect(400);
    await db.close();
  });

  it("인증 없으면 401", async () => {
    const { app, db } = await app1();
    await request(app).post("/api/workspaces/ws1/roadmap/drop").send({ nodeId: "run-1" }).expect(401);
    await db.close();
  });
});
