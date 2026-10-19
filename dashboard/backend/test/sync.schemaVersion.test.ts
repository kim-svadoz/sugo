import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { NextFunction, Request, Response } from "express";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";
import { SYNC_SCHEMA_VERSION, syncSchemaVersion } from "../src/middleware/syncSchemaVersion.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

async function freshApp() {
  const db = createSqliteClient();
  await db.execScript(schema);
  const { app } = await createApp(db);
  const auth = await seedUserToken(db, "u1");
  return { app, db, auth };
}

/** 미들웨어 단위 호출 — express 없이 req/res/next만 흉내낸다. */
function run(body: unknown): { req: Partial<Request>; headers: Record<string, string>; nextCalls: number } {
  const req = { body } as Partial<Request>;
  const headers: Record<string, string> = {};
  const res = { setHeader: (k: string, v: string) => void (headers[k] = v) } as unknown as Response;
  let nextCalls = 0;
  syncSchemaVersion()(req as Request, res, (() => void nextCalls++) as NextFunction);
  return { req, headers, nextCalls };
}

describe("sync schemaVersion 미들웨어", () => {
  it("payload의 schemaVersion을 req.syncSchemaVersion으로 소비한다", () => {
    const { req, nextCalls } = run({ userId: "u1", schemaVersion: 1 });
    expect(req.syncSchemaVersion).toBe(1);
    expect(nextCalls).toBe(1);
  });

  it("schemaVersion이 없으면 undefined로 두고 그냥 통과시킨다(구버전 플러그인 호환)", () => {
    const { req, nextCalls } = run({ userId: "u1" });
    expect(req.syncSchemaVersion).toBeUndefined();
    expect(nextCalls).toBe(1);
  });

  it("상위 버전이어도 통과시키고 경고 로그만 남긴다(500 금지)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { req, nextCalls } = run({ userId: "u1", schemaVersion: SYNC_SCHEMA_VERSION + 7 });
      expect(req.syncSchemaVersion).toBe(SYNC_SCHEMA_VERSION + 7);
      expect(nextCalls).toBe(1);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("같은 상위 버전이 반복 도착해도 로그는 1회만(로그 폭주 방지)", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const mw = syncSchemaVersion();
      const res = { setHeader: () => {} } as unknown as Response;
      for (let i = 0; i < 5; i++) {
        mw({ body: { schemaVersion: SYNC_SCHEMA_VERSION + 1 } } as Request, res, (() => {}) as NextFunction);
      }
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  it("숫자가 아닌 쓰레기 값은 무시한다(400 아님 — sync는 fail-open)", () => {
    for (const bad of ["abc", null, {}, [], NaN, 1.5, -1]) {
      const { req, nextCalls } = run({ userId: "u1", schemaVersion: bad });
      expect(req.syncSchemaVersion).toBeUndefined();
      expect(nextCalls).toBe(1);
    }
  });

  it("body가 객체가 아니어도 던지지 않는다", () => {
    expect(() => run(undefined)).not.toThrow();
    expect(() => run("string body")).not.toThrow();
  });

  it("응답에 서버 계약 버전 헤더를 실어 역방향 degrade 신호를 준다", () => {
    const { headers } = run({ userId: "u1", schemaVersion: 1 });
    expect(headers["X-Sugo-Sync-Schema-Version"]).toBe(String(SYNC_SCHEMA_VERSION));
  });
});

describe("sync 라우터 end-to-end", () => {
  it("상위 schemaVersion payload도 200이고 데이터는 정상 저장된다", async () => {
    const { app, db, auth } = await freshApp();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await request(app)
        .post("/api/sync/user")
        .set("Authorization", auth)
        .send({ userId: "u1", displayName: "Kim", schemaVersion: SYNC_SCHEMA_VERSION + 100 })
        .expect(200);
      expect(res.headers["x-sugo-sync-schema-version"]).toBe(String(SYNC_SCHEMA_VERSION));
      const rows = await db.query<{ display_name: string }>("SELECT display_name FROM sugo_users WHERE id='u1'");
      expect(rows).toEqual([{ display_name: "Kim" }]);
    } finally {
      warn.mockRestore();
      await db.close();
    }
  });

  it("schemaVersion은 zod가 떨궈서 도메인 컬럼을 오염시키지 않는다", async () => {
    const { app, db, auth } = await freshApp();
    await request(app)
      .post("/api/sync/task")
      .set("Authorization", auth)
      .send({ userId: "u1", workspaceName: "ws1", id: "task-1", title: "T", schemaVersion: SYNC_SCHEMA_VERSION })
      .expect(200);
    const rows = await db.query<Record<string, unknown>>("SELECT * FROM sugo_tasks WHERE id='task-1'");
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).not.toContain("schemaVersion");
    expect(Object.keys(rows[0])).not.toContain("schema_version");
    await db.close();
  });

  it("roadmap 스냅샷 replace도 schemaVersion을 달고 정상 동작한다", async () => {
    const { app, db, auth } = await freshApp();
    await request(app)
      .post("/api/sync/roadmap")
      .set("Authorization", auth)
      .send({
        userId: "u1",
        workspaceName: "ws1",
        schemaVersion: SYNC_SCHEMA_VERSION,
        nodes: [{ id: "run-001", title: "R", level: "workstream", status: "pending" }],
      })
      .expect(200);
    const rows = await db.query<{ id: string }>("SELECT id FROM sugo_roadmap_nodes WHERE user_id='u1'");
    expect(rows.map((r) => r.id)).toEqual(["run-001"]);
    await db.close();
  });
});
