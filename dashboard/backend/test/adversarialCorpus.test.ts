import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";
import { __resetDeletedAtColState } from "../src/services/syncService.js";
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

interface WireNode {
  id: string;
  title: string;
  level: string;
  status: string;
  dependsOn?: string[];
  parent?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncRoadmap(app: any, auth: string, nodes: WireNode[]) {
  await request(app).post("/api/sync/roadmap").set("Authorization", auth).send({ userId: "u1", workspaceName: "ws1", nodes }).expect(200);
}

async function node(db: DbClient, id: string) {
  const rows = await db.query<Record<string, unknown>>("SELECT * FROM sugo_roadmap_nodes WHERE user_id='u1' AND workspace_name='ws1' AND id = ?", [id]);
  return rows[0];
}

async function ids(db: DbClient): Promise<string[]> {
  const rows = await db.query<{ id: string }>("SELECT id FROM sugo_roadmap_nodes WHERE user_id='u1' AND workspace_name='ws1' ORDER BY id");
  return rows.map((r) => r.id);
}

/**
 * 적대적 코퍼스 — 대시보드 적대적 코퍼스. **"반드시 막아야"(버그)를 먼저 시도해보고 실제로 막히는지**
 * 확인하는 테스트다. 구조만 보는 테스트는 자기 구현을 확인하는 순환 검증이 되어 false-green이 뚫린다.
 */
describe("적대적 코퍼스: roadmap sync 소유권 — 대시보드 소유 컬럼을 push가 못 덮는다", () => {
  it("막아야: sync가 manual_status를 덮음", async () => {
    const { app, db, auth } = await freshApp();
    await syncRoadmap(app, auth, [{ id: "t1", title: "T", level: "task", status: "pending" }]);
    await request(app).post("/api/workspaces/ws1/roadmap/manual-status").set("Authorization", auth).send({ nodeId: "t1", status: "done" }).expect(200);

    // 플러그인이 pending으로 다시 push해도 사람이 찍은 done이 이겨야 한다.
    await syncRoadmap(app, auth, [{ id: "t1", title: "T(수정)", level: "task", status: "pending" }]);

    const n = await node(db, "t1");
    expect(n.manual_status).toBe("done"); // 대시보드 소유 — 안 덮임
    expect(n.title).toBe("T(수정)"); // 플러그인 소유 — 덮임
    await db.close();
  });

  it("막아야: sync가 pos_x/pos_y(사람이 배치한 좌표)를 덮음", async () => {
    const { app, db, auth } = await freshApp();
    await syncRoadmap(app, auth, [{ id: "t1", title: "T", level: "task", status: "pending" }]);
    await request(app).post("/api/workspaces/ws1/roadmap/position").set("Authorization", auth).send({ nodeId: "t1", x: 12.5, y: -3 }).expect(200);

    await syncRoadmap(app, auth, [{ id: "t1", title: "T", level: "task", status: "in_progress" }]);

    const n = await node(db, "t1");
    expect(Number(n.pos_x)).toBe(12.5);
    expect(Number(n.pos_y)).toBe(-3);
    await db.close();
  });

  it("지켜야: 플러그인 소유 필드(title/level/status/parent)는 정상 갱신된다", async () => {
    const { app, db, auth } = await freshApp();
    await syncRoadmap(app, auth, [{ id: "t1", title: "old", level: "task", status: "pending" }]);
    await syncRoadmap(app, auth, [{ id: "t1", title: "new", level: "task", status: "done" }]);

    const n = await node(db, "t1");
    expect(n.title).toBe("new");
    expect(n.status).toBe("done");
    await db.close();
  });
});

describe("적대적 코퍼스: depends_on seed — 비어있을 때만", () => {
  it("막아야: 매 sync마다 재기록해 순서 편집을 무효화", async () => {
    const { app, db, auth } = await freshApp();
    await syncRoadmap(app, auth, [
      { id: "t1", title: "T1", level: "task", status: "pending" },
      { id: "t2", title: "T2", level: "task", status: "pending" },
    ]);
    // 사람이 대시보드에서 순서를 편집한다.
    await request(app).post("/api/workspaces/ws1/roadmap/link").set("Authorization", auth).send({ from: "t2", to: "t1" }).expect(200);
    const edited = JSON.parse(String((await node(db, "t2")).depends_on));
    expect(edited).toEqual(["t1"]);

    // 플러그인이 dependsOn 없이(또는 다른 값으로) 다시 push해도 편집이 살아남아야 한다.
    await syncRoadmap(app, auth, [
      { id: "t1", title: "T1", level: "task", status: "pending" },
      { id: "t2", title: "T2", level: "task", status: "pending", dependsOn: [] },
    ]);
    expect(JSON.parse(String((await node(db, "t2")).depends_on))).toEqual(["t1"]);
    await db.close();
  });

  it("지켜야: 비어 있으면 최초 1회 시딩된다", async () => {
    const { app, db, auth } = await freshApp();
    await syncRoadmap(app, auth, [
      { id: "t1", title: "T1", level: "task", status: "pending" },
      { id: "t2", title: "T2", level: "task", status: "pending", dependsOn: ["t1"] },
    ]);
    expect(JSON.parse(String((await node(db, "t2")).depends_on))).toEqual(["t1"]);
    await db.close();
  });
});

describe("적대적 코퍼스: roadmap replace — non-workstream만 삭제", () => {
  it("막아야: payload에 없다고 수동 workstream 그룹까지 삭제", async () => {
    const { app, db, auth } = await freshApp();
    await syncRoadmap(app, auth, [{ id: "t1", title: "T1", level: "task", status: "pending" }]);
    // 사람이 대시보드에서 RUN 그룹을 손으로 만든다(로컬 플러그인은 이 노드를 모른다).
    await request(app)
      .post("/api/workspaces/ws1/roadmap/group")
      .set("Authorization", auth)
      .send({ groupId: "run-001", title: "수동 RUN", members: ["t1"], sequential: false })
      .expect(200);

    // 플러그인이 자기가 아는 것만 담아 replace push.
    await syncRoadmap(app, auth, [{ id: "t1", title: "T1", level: "task", status: "pending" }]);

    expect(await ids(db)).toContain("run-001"); // workstream은 살아남는다
    await db.close();
  });

  it("지켜야: payload에 없는 non-workstream 노드는 삭제된다", async () => {
    const { app, db, auth } = await freshApp();
    await syncRoadmap(app, auth, [
      { id: "t1", title: "T1", level: "task", status: "pending" },
      { id: "t2", title: "T2", level: "task", status: "pending" },
    ]);
    await syncRoadmap(app, auth, [{ id: "t1", title: "T1", level: "task", status: "pending" }]);
    expect(await ids(db)).toEqual(["t1"]);
    await db.close();
  });
});

describe("적대적 코퍼스: deleted_at — 라이브 'No workspaces found' 사고 방지", () => {
  it("막아야: 컬럼이 없을 때 질의 실패를 catch해 빈 목록을 반환", async () => {
    __resetDeletedAtColState();
    const db = createSqliteClient();
    await db.execScript(schema);
    await db.exec("DROP TABLE sugo_workspaces");
    await db.exec("CREATE TABLE sugo_workspaces (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT, name TEXT)");
    const { app } = await createApp(db);
    const auth = await seedUserToken(db, "u1");
    await db.exec("INSERT INTO sugo_workspaces (user_id, name) VALUES ('u1','ws1')");

    const res = await request(app).get("/api/workspaces").set("Authorization", auth).expect(200);
    // 빈 목록이 아니라 실제 워크스페이스가 보여야 한다(필터 생략 degrade).
    expect(res.body.workspaces.map((w: { name: string }) => w.name)).toEqual(["ws1"]);
    await db.close();
  });
});

describe("적대적 코퍼스: soft delete / discard / orphan RUN 요약 회귀", () => {
  it("막아야: delete가 무조건 하드삭제", async () => {
    const { app, db, auth } = await freshApp();
    await request(app).post("/api/sync/workspace").set("Authorization", auth).send({ userId: "u1", name: "ws1" }).expect(200);
    await request(app).delete("/api/sync/workspace").set("Authorization", auth).send({ userId: "u1", name: "ws1" }).expect(200);
    expect(await db.query("SELECT id FROM sugo_workspaces WHERE name='ws1'")).toHaveLength(1);
    await db.close();
  });

  it("막아야: drop이 노드를 실제 DELETE", async () => {
    const { app, db, auth } = await freshApp();
    await syncRoadmap(app, auth, [{ id: "t1", title: "T1", level: "task", status: "pending" }]);
    await request(app).post("/api/workspaces/ws1/roadmap/drop").set("Authorization", auth).send({ nodeId: "t1" }).expect(200);
    expect(await ids(db)).toEqual(["t1"]); // 행은 남고 override만 붙는다
    expect((await node(db, "t1")).manual_status).toBe("dropped");
    await db.close();
  });

  it("막아야: RUN 재편입을 task처럼 잠금", async () => {
    const { app, db, auth } = await freshApp();
    await syncRoadmap(app, auth, [
      { id: "spec-1", title: "S", level: "spec", status: "pending" },
      { id: "spec-2", title: "S2", level: "spec", status: "pending" },
      { id: "run-1", title: "R", level: "workstream", status: "pending", parent: "spec-1" },
    ]);
    await request(app).post("/api/workspaces/ws1/roadmap/run-spec").set("Authorization", auth).send({ runId: "run-1", specId: "spec-2" }).expect(200);
    expect((await node(db, "run-1")).parent).toBe("spec-2");
    await db.close();
  });
});
