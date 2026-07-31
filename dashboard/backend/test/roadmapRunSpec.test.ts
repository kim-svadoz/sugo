import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";
import { __resetDeletedAtColState } from "../src/services/syncService.js";
import { assignRunToSpec, migrateWstToRun, nextGroupId } from "../src/services/workspaceService.js";
import type { DbClient } from "../src/db/client.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

interface N {
  id: string;
  level?: string;
  parent?: string | null;
  depends?: string[] | null;
}

async function seed(db: DbClient, nodes: N[]): Promise<void> {
  await db.exec("INSERT INTO sugo_users (id) VALUES ('u1')");
  for (const n of nodes) {
    await db.exec(
      "INSERT INTO sugo_roadmap_nodes (id, user_id, workspace_name, title, level, status, parent, depends_on) VALUES (?,?,?,?,?,'pending',?,?)",
      [n.id, "u1", "ws1", n.id, n.level ?? "task", n.parent ?? null, n.depends ? JSON.stringify(n.depends) : null],
    );
  }
}

async function fresh() {
  __resetDeletedAtColState();
  const db = createSqliteClient();
  await db.execScript(schema);
  return db;
}

async function parentOf(db: DbClient, id: string): Promise<string | null> {
  const rows = await db.query<{ parent: string | null }>("SELECT parent FROM sugo_roadmap_nodes WHERE id = ?", [id]);
  return rows[0]?.parent ?? null;
}

/**
 * §7 orphan RUN → Spec 편입/분리. **task 잠금과 달리 RUN은 재편입을 허용한다** —
 * task는 한 번 소속이 정해지면 이력이 붙지만, RUN(실행 단위)은 나중에 "이건 저 Spec 일이었다"고
 * 재분류하는 게 정상 작업 흐름이다.
 */
describe("§7 assignRunToSpec", () => {
  it("orphan RUN을 Spec에 편입한다", async () => {
    const db = await fresh();
    await seed(db, [
      { id: "spec-1", level: "spec" },
      { id: "run-1", level: "workstream", parent: null },
    ]);

    const r = await assignRunToSpec(db, "u1", "ws1", "run-1", "spec-1");
    expect(r.ok).toBe(true);
    expect(await parentOf(db, "run-1")).toBe("spec-1");
    await db.close();
  });

  it("이미 편입된 RUN도 다른 Spec으로 재편입된다(task 잠금과 다른 점)", async () => {
    const db = await fresh();
    await seed(db, [
      { id: "spec-1", level: "spec" },
      { id: "spec-2", level: "spec" },
      { id: "run-1", level: "workstream", parent: "spec-1" },
    ]);

    expect((await assignRunToSpec(db, "u1", "ws1", "run-1", "spec-2")).ok).toBe(true);
    expect(await parentOf(db, "run-1")).toBe("spec-2");
    await db.close();
  });

  it("specId가 null이면 분리해 미분류로 만든다", async () => {
    const db = await fresh();
    await seed(db, [
      { id: "spec-1", level: "spec" },
      { id: "run-1", level: "workstream", parent: "spec-1" },
    ]);

    expect((await assignRunToSpec(db, "u1", "ws1", "run-1", null)).ok).toBe(true);
    expect(await parentOf(db, "run-1")).toBeNull();
    await db.close();
  });

  it("runId가 workstream이 아니면 거부한다(fail-closed)", async () => {
    const db = await fresh();
    await seed(db, [
      { id: "spec-1", level: "spec" },
      { id: "task-1", level: "task" },
    ]);
    const r = await assignRunToSpec(db, "u1", "ws1", "task-1", "spec-1");
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("NOT_A_RUN");
    expect(await parentOf(db, "task-1")).toBeNull();
    await db.close();
  });

  it("대상이 spec이 아니면 거부한다", async () => {
    const db = await fresh();
    await seed(db, [
      { id: "run-1", level: "workstream" },
      { id: "run-2", level: "workstream" },
    ]);
    const r = await assignRunToSpec(db, "u1", "ws1", "run-1", "run-2");
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("NOT_A_SPEC");
    await db.close();
  });

  it("자기 자신을 부모로 삼을 수 없다", async () => {
    const db = await fresh();
    await seed(db, [{ id: "run-1", level: "workstream" }]);
    expect((await assignRunToSpec(db, "u1", "ws1", "run-1", "run-1")).ok).toBe(false);
    await db.close();
  });

  it("없는 노드는 not-found", async () => {
    const db = await fresh();
    await seed(db, [
      { id: "spec-1", level: "spec" },
      { id: "run-1", level: "workstream" },
    ]);
    expect((await assignRunToSpec(db, "u1", "ws1", "nope", "spec-1")).errorCode).toBe("NODE_NOT_FOUND");
    expect((await assignRunToSpec(db, "u1", "ws1", "run-1", "nope")).errorCode).toBe("NODE_NOT_FOUND");
    await db.close();
  });
});

describe("§7 nextGroupId — run-NNN 생성기", () => {
  it("비어 있으면 run-001", async () => {
    const db = await fresh();
    await seed(db, []);
    expect(await nextGroupId(db, "u1", "ws1")).toBe("run-001");
    await db.close();
  });

  it("최대 번호 + 1 (3자리 pad)", async () => {
    const db = await fresh();
    await seed(db, [
      { id: "run-001", level: "workstream" },
      { id: "run-007", level: "workstream" },
      { id: "run-003", level: "workstream" },
    ]);
    expect(await nextGroupId(db, "u1", "ws1")).toBe("run-008");
    await db.close();
  });

  it("구 wst- 형식은 인식하지 않는다(파서는 run- 단일형만)", async () => {
    const db = await fresh();
    await seed(db, [{ id: "wst-009", level: "workstream" }]);
    expect(await nextGroupId(db, "u1", "ws1")).toBe("run-001");
    await db.close();
  });

  it("999를 넘으면 pad 없이 이어간다(자릿수 유실 금지)", async () => {
    const db = await fresh();
    await seed(db, [{ id: "run-999", level: "workstream" }]);
    expect(await nextGroupId(db, "u1", "ws1")).toBe("run-1000");
    await db.close();
  });

  it("run-abc 같은 비정형은 무시한다", async () => {
    const db = await fresh();
    await seed(db, [{ id: "run-abc", level: "workstream" }, { id: "run-002", level: "workstream" }]);
    expect(await nextGroupId(db, "u1", "ws1")).toBe("run-003");
    await db.close();
  });
});

/**
 * §7 `wst-` → `run-` in-place 마이그레이션. id뿐 아니라 **참조 3곳(id·parent·depends_on)**을
 * 다 바꿔야 한다 — 하나라도 빠지면 dangling 참조가 되어 그래프가 조용히 끊긴다.
 * 길이가 같아(`wst-`/`run-` 둘 다 4자) depends_on JSON은 문자열 치환으로도 유효성이 유지된다.
 */
describe("§7 migrateWstToRun", () => {
  it("id·parent·depends_on 참조를 전부 옮긴다", async () => {
    const db = await fresh();
    await seed(db, [
      { id: "wst-001", level: "workstream" },
      { id: "task-1", parent: "wst-001", depends: ["wst-001", "task-9"] },
    ]);

    const r = await migrateWstToRun(db);
    expect(r.migrated).toBe(1);

    const ids = (await db.query<{ id: string }>("SELECT id FROM sugo_roadmap_nodes ORDER BY id")).map((x) => x.id);
    expect(ids).toEqual(["run-001", "task-1"]);
    expect(await parentOf(db, "task-1")).toBe("run-001");
    const dep = (await db.query<{ depends_on: string }>("SELECT depends_on FROM sugo_roadmap_nodes WHERE id='task-1'"))[0];
    expect(JSON.parse(dep.depends_on)).toEqual(["run-001", "task-9"]);
    await db.close();
  });

  it("멱등 — 두 번 돌려도 그대로", async () => {
    const db = await fresh();
    await seed(db, [{ id: "wst-001", level: "workstream" }]);
    await migrateWstToRun(db);
    const second = await migrateWstToRun(db);
    expect(second.migrated).toBe(0);
    expect((await db.query<{ id: string }>("SELECT id FROM sugo_roadmap_nodes")).map((x) => x.id)).toEqual(["run-001"]);
    await db.close();
  });

  it("wst-가 없으면 no-op", async () => {
    const db = await fresh();
    await seed(db, [{ id: "run-001", level: "workstream" }]);
    expect((await migrateWstToRun(db)).migrated).toBe(0);
    await db.close();
  });

  it("실패해도 던지지 않는다(부팅 차단 금지)", async () => {
    const broken: DbClient = {
      query: async () => {
        throw new Error("denied");
      },
      exec: async () => {
        throw new Error("denied");
      },
      execScript: async () => {},
      close: async () => {},
    };
    await expect(migrateWstToRun(broken)).resolves.toEqual({ migrated: 0 });
  });
});

describe("§3.3 POST /:name/roadmap/run-spec", () => {
  async function app1() {
    const db = await fresh();
    await seed(db, [
      { id: "spec-1", level: "spec" },
      { id: "run-1", level: "workstream", parent: null },
      { id: "task-1", level: "task" },
    ]);
    const { app } = await createApp(db);
    const auth = await seedUserToken(db, "u1");
    return { app, db, auth };
  }

  it("편입과 분리가 모두 동작한다", async () => {
    const { app, db, auth } = await app1();
    await request(app).post("/api/workspaces/ws1/roadmap/run-spec").set("Authorization", auth).send({ runId: "run-1", specId: "spec-1" }).expect(200);
    expect(await parentOf(db, "run-1")).toBe("spec-1");

    await request(app).post("/api/workspaces/ws1/roadmap/run-spec").set("Authorization", auth).send({ runId: "run-1", specId: null }).expect(200);
    expect(await parentOf(db, "run-1")).toBeNull();
    await db.close();
  });

  it("RUN이 아닌 노드는 409", async () => {
    const { app, db, auth } = await app1();
    const res = await request(app).post("/api/workspaces/ws1/roadmap/run-spec").set("Authorization", auth).send({ runId: "task-1", specId: "spec-1" });
    expect(res.status).toBe(409);
    expect(res.body.errorCode).toBe("NOT_A_RUN");
    await db.close();
  });

  it("없는 노드는 404", async () => {
    const { app, db, auth } = await app1();
    const res = await request(app).post("/api/workspaces/ws1/roadmap/run-spec").set("Authorization", auth).send({ runId: "nope", specId: null });
    expect(res.status).toBe(404);
    await db.close();
  });

  it("runId 없이 부르면 400", async () => {
    const { app, db, auth } = await app1();
    await request(app).post("/api/workspaces/ws1/roadmap/run-spec").set("Authorization", auth).send({ specId: "spec-1" }).expect(400);
    await db.close();
  });
});

/** 실제 MySQL 검증에서 잡은 회귀: NULL depends_on이 []로 변질되면 "미시딩"과 "빈 편집"이 뒤섞인다. */
describe("§7 migrateWstToRun — NULL depends_on 보존", () => {
  it("depends_on이 NULL이면 NULL로 남는다", async () => {
    const db = await fresh();
    await seed(db, [{ id: "wst-001", level: "workstream", depends: null }]);
    await migrateWstToRun(db);
    const row = (await db.query<{ depends_on: unknown }>("SELECT depends_on FROM sugo_roadmap_nodes WHERE id='run-001'"))[0];
    expect(row.depends_on).toBeNull();
    await db.close();
  });

  it("빈 배열로 편집한 것은 빈 배열로 남는다", async () => {
    const db = await fresh();
    await seed(db, [{ id: "wst-001", level: "workstream", depends: [] }]);
    await migrateWstToRun(db);
    const row = (await db.query<{ depends_on: string }>("SELECT depends_on FROM sugo_roadmap_nodes WHERE id='run-001'"))[0];
    expect(JSON.parse(row.depends_on)).toEqual([]);
    await db.close();
  });
});
