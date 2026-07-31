import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";
import { __resetDeletedAtColState, ensureWorkspaceDeletedAtColumn } from "../src/services/syncService.js";
import type { DbClient } from "../src/db/client.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

async function freshApp() {
  __resetDeletedAtColState();
  const db = createSqliteClient();
  await db.execScript(schema);
  const { app } = await createApp(db);
  const auth = await seedUserToken(db, "u1");
  return { app, db, auth };
}

async function addWorkspace(app: unknown, auth: string, name: string, projects: string[] = []) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await request(app as any).post("/api/sync/workspace").set("Authorization", auth).send({ userId: "u1", name, projects }).expect(200);
}

/**
 * §4 워크스페이스 soft delete. 플러그인(§9)이 기본 soft로 삭제를 보내므로 대시보드도 같은 의미로
 * 받아야 한다 — 여기서 하드 삭제하면 "복구 가능하다고 안내받은" 사용자의 데이터가 실제로는 사라진다.
 */
describe("§4 DELETE /api/sync/workspace — 기본 soft", () => {
  it("기본 삭제는 deleted_at만 찍고 행을 남긴다", async () => {
    const { app, db, auth } = await freshApp();
    await addWorkspace(app, auth, "ws1");

    await request(app).delete("/api/sync/workspace").set("Authorization", auth).send({ userId: "u1", name: "ws1" }).expect(200);

    const rows = await db.query<{ deleted_at: string | null }>("SELECT deleted_at FROM sugo_workspaces WHERE name='ws1'");
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted_at).toBeTruthy();
    await db.close();
  });

  it("목록 조회에서 숨는다", async () => {
    const { app, db, auth } = await freshApp();
    await addWorkspace(app, auth, "ws1");
    await addWorkspace(app, auth, "ws2");
    await request(app).delete("/api/sync/workspace").set("Authorization", auth).send({ userId: "u1", name: "ws1" }).expect(200);

    const res = await request(app).get("/api/workspaces").set("Authorization", auth).expect(200);
    expect(res.body.workspaces.map((w: { name: string }) => w.name)).toEqual(["ws2"]);
    await db.close();
  });

  it("재sync하면 부활한다(deleted_at = NULL)", async () => {
    const { app, db, auth } = await freshApp();
    await addWorkspace(app, auth, "ws1", ["C:/a"]);
    await request(app).delete("/api/sync/workspace").set("Authorization", auth).send({ userId: "u1", name: "ws1" }).expect(200);

    await addWorkspace(app, auth, "ws1", ["C:/a"]);

    const rows = await db.query<{ deleted_at: string | null }>("SELECT deleted_at FROM sugo_workspaces WHERE name='ws1'");
    expect(rows[0].deleted_at).toBeNull();
    const res = await request(app).get("/api/workspaces").set("Authorization", auth).expect(200);
    expect(res.body.workspaces.map((w: { name: string }) => w.name)).toEqual(["ws1"]);
    await db.close();
  });

  it("soft delete는 태스크/로드맵 데이터를 지우지 않는다(복구 가능해야 하므로)", async () => {
    const { app, db, auth } = await freshApp();
    await addWorkspace(app, auth, "ws1");
    await request(app).post("/api/sync/task").set("Authorization", auth).send({ userId: "u1", workspaceName: "ws1", id: "t1", title: "T" }).expect(200);

    await request(app).delete("/api/sync/workspace").set("Authorization", auth).send({ userId: "u1", name: "ws1" }).expect(200);

    expect(await db.query("SELECT id FROM sugo_tasks WHERE workspace_name='ws1'")).toHaveLength(1);
    await db.close();
  });
});

describe("§4 DELETE /api/sync/workspace — purge(하드)", () => {
  it("purge:true면 워크스페이스 행과 관련 데이터가 사라진다", async () => {
    const { app, db, auth } = await freshApp();
    await addWorkspace(app, auth, "ws1", ["C:/a"]);
    await request(app).post("/api/sync/task").set("Authorization", auth).send({ userId: "u1", workspaceName: "ws1", id: "t1", title: "T" }).expect(200);
    await request(app)
      .post("/api/sync/roadmap")
      .set("Authorization", auth)
      .send({ userId: "u1", workspaceName: "ws1", nodes: [{ id: "run-001", title: "R", level: "workstream", status: "pending" }] })
      .expect(200);

    await request(app).delete("/api/sync/workspace").set("Authorization", auth).send({ userId: "u1", name: "ws1", purge: true }).expect(200);

    expect(await db.query("SELECT id FROM sugo_workspaces WHERE name='ws1'")).toHaveLength(0);
    expect(await db.query("SELECT id FROM sugo_tasks WHERE workspace_name='ws1'")).toHaveLength(0);
    expect(await db.query("SELECT id FROM sugo_roadmap_nodes WHERE workspace_name='ws1'")).toHaveLength(0);
    await db.close();
  });

  it("purge는 다른 워크스페이스/다른 유저 데이터를 건드리지 않는다", async () => {
    const { app, db, auth } = await freshApp();
    await addWorkspace(app, auth, "ws1");
    await addWorkspace(app, auth, "ws2");
    await request(app).post("/api/sync/task").set("Authorization", auth).send({ userId: "u1", workspaceName: "ws2", id: "t2", title: "T2" }).expect(200);

    const auth2 = await seedUserToken(db, "u2");
    await request(app).post("/api/sync/workspace").set("Authorization", auth2).send({ userId: "u2", name: "ws1" }).expect(200);

    await request(app).delete("/api/sync/workspace").set("Authorization", auth).send({ userId: "u1", name: "ws1", purge: true }).expect(200);

    expect(await db.query("SELECT id FROM sugo_tasks WHERE workspace_name='ws2'")).toHaveLength(1);
    expect(await db.query("SELECT id FROM sugo_workspaces WHERE user_id='u2' AND name='ws1'")).toHaveLength(1);
    await db.close();
  });
});

/**
 * §4 자가보강. **코드가 마이그레이션보다 먼저 배포돼도 라이브가 안 깨지게** 하는 근본 방지책 —
 * 컬럼이 없고 ALTER 권한도 없으면 필터를 생략해 전부 노출한다(graceful degrade).
 * 숨김이 안 되는 건 불편이지만, 여기서 500을 내면 대시보드 전체가 멈춘다.
 */
describe("§4 ensureWorkspaceDeletedAtColumn — 자가보강 + graceful degrade", () => {
  it("컬럼이 없으면 ALTER로 추가한다", async () => {
    __resetDeletedAtColState();
    const db = createSqliteClient();
    await db.exec("CREATE TABLE sugo_workspaces (id INTEGER PRIMARY KEY, user_id TEXT, name TEXT)");

    expect(await ensureWorkspaceDeletedAtColumn(db)).toBe(true);
    await db.exec("INSERT INTO sugo_workspaces (user_id, name, deleted_at) VALUES ('u1','ws1',NULL)");
    expect(await db.query("SELECT deleted_at FROM sugo_workspaces")).toHaveLength(1);
    await db.close();
  });

  it("결과를 캐시해 매 요청마다 information_schema를 때리지 않는다", async () => {
    __resetDeletedAtColState();
    const db = createSqliteClient();
    await db.execScript(schema);
    let calls = 0;
    const counting: DbClient = {
      query: (sql, params) => {
        calls++;
        return db.query(sql, params);
      },
      exec: (sql, params) => db.exec(sql, params),
      execScript: (t) => db.execScript(t),
      close: () => db.close(),
    };

    await ensureWorkspaceDeletedAtColumn(counting);
    const after = calls;
    await ensureWorkspaceDeletedAtColumn(counting);
    await ensureWorkspaceDeletedAtColumn(counting);
    expect(calls).toBe(after); // 2·3회차는 DB를 아예 안 건드린다
    await db.close();
  });

  it("컬럼도 없고 ALTER도 못 하면 false를 반환하고 던지지 않는다(필터 생략)", async () => {
    __resetDeletedAtColState();
    const broken: DbClient = {
      query: async () => {
        throw new Error("SELECT denied");
      },
      exec: async () => {
        throw new Error("ALTER denied");
      },
      execScript: async () => {},
      close: async () => {},
    };
    await expect(ensureWorkspaceDeletedAtColumn(broken)).resolves.toBe(false);
  });

  it("컬럼이 없어도 목록 조회가 500이 아니라 전부 노출로 degrade한다", async () => {
    __resetDeletedAtColState();
    const db = createSqliteClient();
    await db.execScript(schema);
    // 컬럼을 지운 상태를 흉내내기 위해 테이블을 컬럼 없이 재생성한다.
    await db.exec("DROP TABLE sugo_workspaces");
    await db.exec("CREATE TABLE sugo_workspaces (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, name TEXT, created_at TEXT, updated_at TEXT)");
    const { app } = await createApp(db);
    const auth = await seedUserToken(db, "u1");
    await db.exec("INSERT INTO sugo_workspaces (user_id, name) VALUES ('u1','ws1')");

    const res = await request(app).get("/api/workspaces").set("Authorization", auth);
    expect(res.status).toBe(200);
    expect(res.body.workspaces.map((w: { name: string }) => w.name)).toContain("ws1");
    await db.close();
  });
});
