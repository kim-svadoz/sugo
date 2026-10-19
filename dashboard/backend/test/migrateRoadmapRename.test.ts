import { describe, expect, it, vi } from "vitest";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { migrateCanvasToRoadmap, migrateRoadmapRuntimeAssessment } from "../src/db/migrations.js";
import type { DbClient } from "../src/db/client.js";

const OLD = `CREATE TABLE sugo_canvas_nodes (
  user_id VARCHAR(100) NOT NULL,
  workspace_name VARCHAR(200) NOT NULL,
  id VARCHAR(100) NOT NULL,
  title VARCHAR(500),
  level VARCHAR(20),
  status VARCHAR(20),
  PRIMARY KEY (user_id, workspace_name, id)
)`;

const NEW = OLD.replace("sugo_canvas_nodes", "sugo_roadmap_nodes");

async function tableNames(db: DbClient): Promise<string[]> {
  const rows = await db.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
  return rows.map((r) => r.name);
}

describe("테이블 이름 변경 마이그레이션", () => {
  it("이전 이름의 테이블만 있으면 데이터를 보존한 채 이름을 바꾼다", async () => {
    const db = createSqliteClient();
    await db.exec(OLD);
    await db.exec("INSERT INTO sugo_canvas_nodes VALUES ('u1','ws1','run-001','R','workstream','pending')");

    await migrateCanvasToRoadmap(db);

    expect(await tableNames(db)).toEqual(["sugo_roadmap_nodes"]);
    const rows = await db.query<{ id: string; title: string }>("SELECT id, title FROM sugo_roadmap_nodes");
    expect(rows).toEqual([{ id: "run-001", title: "R" }]);
    await db.close();
  });

  it("신 테이블만 있으면(신규 설치) 아무 것도 안 한다", async () => {
    const db = createSqliteClient();
    await db.exec(NEW);
    await db.exec("INSERT INTO sugo_roadmap_nodes VALUES ('u1','ws1','run-001','R','workstream','pending')");

    await migrateCanvasToRoadmap(db);

    expect(await tableNames(db)).toEqual(["sugo_roadmap_nodes"]);
    expect(await db.query("SELECT id FROM sugo_roadmap_nodes")).toHaveLength(1);
    await db.close();
  });

  it("둘 다 없으면(빈 DB) 조용히 넘어간다 — 스키마 생성보다 먼저 돌아도 안전", async () => {
    const db = createSqliteClient();
    await expect(migrateCanvasToRoadmap(db)).resolves.toBeUndefined();
    expect(await tableNames(db)).toEqual([]);
    await db.close();
  });

  it("둘 다 있으면 리네임하지 않고 경고만 남긴다(데이터 유실 금지)", async () => {
    const db = createSqliteClient();
    await db.exec(OLD);
    await db.exec("INSERT INTO sugo_canvas_nodes VALUES ('u1','ws1','old-1','O','task','done')");
    await db.exec(NEW);
    await db.exec("INSERT INTO sugo_roadmap_nodes VALUES ('u1','ws1','new-1','N','task','done')");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await migrateCanvasToRoadmap(db);
      expect(await tableNames(db)).toEqual(["sugo_canvas_nodes", "sugo_roadmap_nodes"]);
      expect(await db.query("SELECT id FROM sugo_canvas_nodes")).toHaveLength(1);
      expect(await db.query("SELECT id FROM sugo_roadmap_nodes")).toHaveLength(1);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
      await db.close();
    }
  });

  it("두 번 돌려도 같은 결과(멱등)", async () => {
    const db = createSqliteClient();
    await db.exec(OLD);
    await db.exec("INSERT INTO sugo_canvas_nodes VALUES ('u1','ws1','run-001','R','workstream','pending')");

    await migrateCanvasToRoadmap(db);
    await migrateCanvasToRoadmap(db);

    expect(await tableNames(db)).toEqual(["sugo_roadmap_nodes"]);
    expect(await db.query("SELECT id FROM sugo_roadmap_nodes")).toHaveLength(1);
    await db.close();
  });

  it("DB가 권한 부족 등으로 실패해도 부팅을 막지 않는다(graceful degrade)", async () => {
    const broken: DbClient = {
      query: async () => {
        throw new Error("SELECT command denied");
      },
      exec: async () => {
        throw new Error("ALTER command denied");
      },
      execScript: async () => {},
      close: async () => {},
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      await expect(migrateCanvasToRoadmap(broken)).resolves.toBeUndefined();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("runtime_assessment 컬럼 부팅 마이그레이션", () => {
  it("sync 요청 전에도 이미 있는 roadmap 테이블에 컬럼을 추가한다", async () => {
    const db = createSqliteClient();
    await db.exec(NEW);

    await migrateRoadmapRuntimeAssessment(db);

    const columns = await db.query<{ name: string }>("PRAGMA table_info(sugo_roadmap_nodes)");
    expect(columns.map((column) => column.name)).toContain("runtime_assessment");
    await db.close();
  });

  it("두 번 실행해도 안전하고 행을 보존한다", async () => {
    const db = createSqliteClient();
    await db.exec(NEW);
    await db.exec("INSERT INTO sugo_roadmap_nodes VALUES ('u1','ws1','task-1','T','task','pending')");

    await migrateRoadmapRuntimeAssessment(db);
    await migrateRoadmapRuntimeAssessment(db);

    expect(await db.query("SELECT id FROM sugo_roadmap_nodes")).toEqual([{ id: "task-1" }]);
    await db.close();
  });
});
