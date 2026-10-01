import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

async function appWithNodesIn(
  workspaceName: string,
  nodes: Array<{ id: string; level: string; status?: string }>,
  ctx?: { app: import("express").Express; db: ReturnType<typeof createSqliteClient>; auth: string }
) {
  const { app, db, auth } = ctx ?? (await bootApp());
  await request(app)
    .post("/api/sync/roadmap")
    .set("Authorization", auth)
    .send({
      userId: "u1",
      workspaceName,
      nodes: nodes.map((n) => ({ id: n.id, title: n.id, level: n.level, status: n.status ?? "pending" })),
    });
  return { app, db, auth };
}

async function bootApp() {
  const db = createSqliteClient();
  await db.execScript(schema);
  const { app } = await createApp(db);
  const auth = await seedUserToken(db, "u1");
  return { app, db, auth };
}

describe("GET /api/workspaces/schedule — §7B 워크스페이스 비종속 집계", () => {
  it("전체 워크스페이스에서 level='spec' 노드만, due_date NULL 포함해서 반환한다", async () => {
    const ctx = await bootApp();
    await appWithNodesIn("ws1", [{ id: "spec1", level: "spec" }, { id: "run1", level: "workstream" }], ctx);
    await appWithNodesIn("ws2", [{ id: "spec2", level: "spec" }], ctx);

    const res = await request(ctx.app).get("/api/workspaces/schedule").query({ userId: "u1" }).set("Authorization", ctx.auth).expect(200);

    const ids = res.body.specs.map((s: { id: string }) => s.id);
    expect(ids.sort()).toEqual(["spec1", "spec2"]);
    expect(res.body.specs.every((s: { due_date: unknown }) => s.due_date === null)).toBe(true);
    expect(res.body.specs.find((s: { id: string; workspace_name: string }) => s.id === "spec2").workspace_name).toBe("ws2");
  });

  it("SPEC 원문 경로와 하위 RUN 존재 여부를 함께 반환한다", async () => {
    const ctx = await bootApp();
    await appWithNodesIn("ws1", [{ id: "spec1", level: "spec" }, { id: "run1", level: "workstream" }], ctx);
    await ctx.db.exec("UPDATE sugo_roadmap_nodes SET spec_path = ? WHERE id = ?", ["/tmp/spec.md", "spec1"]);
    await ctx.db.exec("UPDATE sugo_roadmap_nodes SET parent = ? WHERE id = ?", ["spec1", "run1"]);
    const res = await request(ctx.app).get("/api/workspaces/schedule").set("Authorization", ctx.auth).expect(200);
    expect(res.body.specs.find((s: { id: string }) => s.id === "spec1")).toMatchObject({
      spec_path: "/tmp/spec.md",
      has_run: true,
    });
  });

  it("SPEC 하위 Task 상태와 우선 확인할 Task를 함께 반환한다", async () => {
    const ctx = await bootApp();
    await request(ctx.app).post("/api/sync/roadmap").set("Authorization", ctx.auth).send({
      userId: "u1",
      workspaceName: "ws1",
      nodes: [
        { id: "spec1", title: "SPEC", level: "spec", status: "in_progress" },
        { id: "run1", title: "RUN", level: "workstream", status: "in_progress", parent: "spec1" },
        { id: "task-running", title: "진행 작업", level: "task", status: "in_progress", parent: "run1" },
        { id: "task-blocked", title: "차단 작업", level: "task", status: "blocked", parent: "run1", note: "정책 확인 대기" },
      ],
    }).expect(200);

    const res = await request(ctx.app).get("/api/workspaces/schedule").set("Authorization", ctx.auth).expect(200);
    expect(res.body.specs[0]).toMatchObject({
      task_count: 2,
      active_task_count: 1,
      blocked_task_count: 1,
      focus_task_id: "task-blocked",
      focus_task_title: "차단 작업",
      focus_task_status: "blocked",
      focus_task_note: "정책 확인 대기",
    });
  });

  it("우선 Task의 versioned runtime assessment를 Schedule read model에 전달한다", async () => {
    const ctx = await bootApp();
    const runtimeAssessment = {
      projectionSchemaVersion: 1, status: "blocked", currentStage: "TEST_RUNNING",
      nextActions: [], recommendedAction: null, humanDecisionRequired: true,
      blockers: ["승인 필요"], evidence: [], blockingReason: "승인 필요",
    };
    await request(ctx.app).post("/api/sync/roadmap").set("Authorization", ctx.auth).send({
      userId: "u1", workspaceName: "ws1", nodes: [
        { id: "spec1", title: "SPEC", level: "spec", status: "in_progress" },
        { id: "run1", title: "RUN", level: "workstream", status: "in_progress", parent: "spec1" },
        { id: "task1", title: "Task", level: "task", status: "blocked", parent: "run1", runtimeAssessment },
      ],
    }).expect(200);

    const res = await request(ctx.app).get("/api/workspaces/schedule").set("Authorization", ctx.auth).expect(200);
    expect(res.body.specs[0].focus_task_runtime_assessment).toEqual(runtimeAssessment);
  });

  it("다른 유저의 spec은 섞이지 않는다", async () => {
    const ctx = await bootApp();
    await appWithNodesIn("ws1", [{ id: "spec1", level: "spec" }], ctx);
    const otherAuth = await seedUserToken(ctx.db, "u2");
    await request(ctx.app)
      .post("/api/sync/roadmap")
      .set("Authorization", otherAuth)
      .send({ userId: "u2", workspaceName: "ws1", nodes: [{ id: "spec-other", title: "spec-other", level: "spec", status: "pending" }] });

    const res = await request(ctx.app).get("/api/workspaces/schedule").query({ userId: "u1" }).set("Authorization", ctx.auth).expect(200);
    expect(res.body.specs.map((s: { id: string }) => s.id)).toEqual(["spec1"]);
  });

  it("Canvas에서 이름을 바꾼 스펙은 재동기화 뒤에도 바뀐 이름을 보여준다", async () => {
    const ctx = await bootApp();
    await appWithNodesIn("ws1", [{ id: "spec1", level: "spec" }], ctx);
    await request(ctx.app)
      .post("/api/workspaces/ws1/roadmap/rename")
      .query({ userId: "u1" }).set("Authorization", ctx.auth)
      .send({ nodeId: "spec1", title: "바뀐 제목" })
      .expect(200);
    await request(ctx.app)
      .post("/api/sync/roadmap").set("Authorization", ctx.auth)
      .send({ userId: "u1", workspaceName: "ws1", nodes: [{ id: "spec1", title: "spec1", level: "spec", status: "in_progress" }] });

    const res = await request(ctx.app).get("/api/workspaces/schedule").query({ userId: "u1" }).set("Authorization", ctx.auth).expect(200);
    expect(res.body.specs.find((s: { id: string }) => s.id === "spec1").title).toBe("바뀐 제목");
  });
});

describe("POST /api/workspaces/:name/roadmap/spec-document", () => {
  it("feat 전에는 원문 경로를 연결하고 새 버전으로 바꿀 수 있다", async () => {
    const { app, db, auth } = await appWithNodesIn("ws1", [{ id: "spec1", level: "spec" }]);
    for (const specPath of ["/tmp/v1/spec.md", "/tmp/v2/spec.md"]) {
      await request(app).post("/api/workspaces/ws1/roadmap/spec-document").set("Authorization", auth)
        .send({ nodeId: "spec1", specPath }).expect(200);
    }
    const rows = await db.query<{ spec_path: string }>("SELECT spec_path FROM sugo_roadmap_nodes WHERE id = ?", ["spec1"]);
    expect(rows[0].spec_path).toBe("/tmp/v2/spec.md");
  });

  it("하위 RUN이 생긴 뒤에는 SPEC 변경을 거부한다", async () => {
    const ctx = await bootApp();
    await appWithNodesIn("ws1", [{ id: "spec1", level: "spec" }, { id: "run1", level: "workstream" }], ctx);
    await ctx.db.exec("UPDATE sugo_roadmap_nodes SET spec_path = ? WHERE id = ?", ["/tmp/v1/spec.md", "spec1"]);
    await ctx.db.exec("UPDATE sugo_roadmap_nodes SET parent = ? WHERE id = ?", ["spec1", "run1"]);
    const res = await request(ctx.app).post("/api/workspaces/ws1/roadmap/spec-document").set("Authorization", ctx.auth)
      .send({ nodeId: "spec1", specPath: "/tmp/v2/spec.md" }).expect(409);
    expect(res.body.errorCode).toBe("SPEC_LOCKED_AFTER_FEAT");
    const rows = await ctx.db.query<{ spec_path: string }>("SELECT spec_path FROM sugo_roadmap_nodes WHERE id = ?", ["spec1"]);
    expect(rows[0].spec_path).toBe("/tmp/v1/spec.md");
  });
});

describe("GET/PUT /api/workspaces/:name/roadmap/spec-document — 원문 조회·수정", () => {
  it("연결된 Markdown을 읽고 feat 전에는 원자적으로 수정한다", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sugo-spec-editor-"));
    const specPath = join(dir, "spec.md");
    writeFileSync(specPath, "# v1\n");
    try {
      const { app, db, auth } = await appWithNodesIn("ws1", [{ id: "spec1", level: "spec" }]);
      await db.exec("UPDATE sugo_roadmap_nodes SET spec_path = ? WHERE id = ?", [specPath, "spec1"]);
      const before = await request(app).get("/api/workspaces/ws1/roadmap/spec-document").query({ nodeId: "spec1" }).set("Authorization", auth).expect(200);
      expect(before.body).toMatchObject({ content: "# v1\n", specPath, locked: false });
      await request(app).put("/api/workspaces/ws1/roadmap/spec-document").set("Authorization", auth)
        .send({ nodeId: "spec1", content: "# v2\n\n수정됨\n" }).expect(200);
      expect(readFileSync(specPath, "utf8")).toBe("# v2\n\n수정됨\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("feat RUN 생성 뒤에는 읽기만 허용하고 저장은 409로 거부한다", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sugo-spec-editor-"));
    const specPath = join(dir, "spec.md");
    writeFileSync(specPath, "# locked\n");
    try {
      const ctx = await bootApp();
      await appWithNodesIn("ws1", [{ id: "spec1", level: "spec" }, { id: "run1", level: "workstream" }], ctx);
      await ctx.db.exec("UPDATE sugo_roadmap_nodes SET spec_path = ? WHERE id = ?", [specPath, "spec1"]);
      await ctx.db.exec("UPDATE sugo_roadmap_nodes SET parent = ? WHERE id = ?", ["spec1", "run1"]);
      const read = await request(ctx.app).get("/api/workspaces/ws1/roadmap/spec-document").query({ nodeId: "spec1" }).set("Authorization", ctx.auth).expect(200);
      expect(read.body.locked).toBe(true);
      const save = await request(ctx.app).put("/api/workspaces/ws1/roadmap/spec-document").set("Authorization", ctx.auth)
        .send({ nodeId: "spec1", content: "# changed\n" }).expect(409);
      expect(save.body.errorCode).toBe("SPEC_LOCKED_AFTER_FEAT");
      expect(readFileSync(specPath, "utf8")).toBe("# locked\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("POST /api/workspaces/:name/roadmap/due-date — §7B", () => {
  it("level='spec' 노드에 날짜를 지정하면 즉시 반영된다", async () => {
    const { app, db, auth } = await appWithNodesIn("ws1", [{ id: "spec1", level: "spec" }]);
    await request(app)
      .post("/api/workspaces/ws1/roadmap/due-date")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "spec1", dueDate: "2026-10-01" })
      .expect(200);

    const rows = await db.query<{ due_date: string }>("SELECT due_date FROM sugo_roadmap_nodes WHERE id='spec1'");
    expect(rows[0].due_date).toBe("2026-10-01");
  });

  it("null을 보내면 기한 미정으로 되돌린다", async () => {
    const { app, db, auth } = await appWithNodesIn("ws1", [{ id: "spec1", level: "spec" }]);
    await request(app)
      .post("/api/workspaces/ws1/roadmap/due-date")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "spec1", dueDate: "2026-10-01" })
      .expect(200);
    await request(app)
      .post("/api/workspaces/ws1/roadmap/due-date")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "spec1", dueDate: null })
      .expect(200);

    const rows = await db.query<{ due_date: string | null }>("SELECT due_date FROM sugo_roadmap_nodes WHERE id='spec1'");
    expect(rows[0].due_date).toBeNull();
  });

  it("반드시 거부: level='spec'이 아닌 노드", async () => {
    const { app, auth } = await appWithNodesIn("ws1", [{ id: "task1", level: "task" }]);
    const res = await request(app)
      .post("/api/workspaces/ws1/roadmap/due-date")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "task1", dueDate: "2026-10-01" })
      .expect(400);
    expect(res.body.errorCode).toBe("INVALID_LEVEL");
  });

  it("존재하지 않는 노드는 404", async () => {
    const { app, auth } = await appWithNodesIn("ws1", [{ id: "spec1", level: "spec" }]);
    const res = await request(app)
      .post("/api/workspaces/ws1/roadmap/due-date")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "nope", dueDate: "2026-10-01" })
      .expect(404);
    expect(res.body.errorCode).toBe("NODE_NOT_FOUND");
  });

  it("형식이 틀린 날짜는 400(zod validation)", async () => {
    const { app, auth } = await appWithNodesIn("ws1", [{ id: "spec1", level: "spec" }]);
    await request(app)
      .post("/api/workspaces/ws1/roadmap/due-date")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "spec1", dueDate: "2026/10/01" })
      .expect(400);
  });
});

describe("POST /api/workspaces/:name/roadmap/quick-spec — §7B 경량 Spec 생성", () => {
  it("Run/Task 없이 level='spec' 노드만 만들고, 곧바로 /schedule에 나타난다", async () => {
    const { app, db, auth } = await bootApp();
    const res = await request(app)
      .post("/api/workspaces/ws1/roadmap/quick-spec")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ title: "다음 분기 마이그레이션", dueDate: "2026-11-01" })
      .expect(200);

    expect(res.body.ok).toBe(true);
    const id = res.body.id as string;
    expect(id.startsWith("spec-manual-")).toBe(true);

    const rows = await db.query<{ level: string; parent: string | null; due_date: string }>(
      "SELECT level, parent, due_date FROM sugo_roadmap_nodes WHERE id = ?",
      [id]
    );
    expect(rows).toEqual([{ level: "spec", parent: null, due_date: "2026-11-01" }]);

    const schedule = await request(app).get("/api/workspaces/schedule").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(schedule.body.specs.some((s: { id: string }) => s.id === id)).toBe(true);
  });

  it("dueDate 없이도 만들 수 있다(기한 미정 백로그용)", async () => {
    const { app, db, auth } = await bootApp();
    const res = await request(app)
      .post("/api/workspaces/ws1/roadmap/quick-spec")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ title: "언젠가 할 일" })
      .expect(200);

    const rows = await db.query<{ due_date: string | null }>("SELECT due_date FROM sugo_roadmap_nodes WHERE id = ?", [res.body.id]);
    expect(rows[0].due_date).toBeNull();
  });

  it("projectPath를 함께 보내면 즉시 저장되고 /schedule에도 실린다", async () => {
    const { app, db, auth } = await bootApp();
    const res = await request(app)
      .post("/api/workspaces/ws1/roadmap/quick-spec")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ title: "프로젝트 지정 스펙", projectPath: "/home/u1/projects/orders-api" })
      .expect(200);

    const rows = await db.query<{ project_path: string | null }>("SELECT project_path FROM sugo_roadmap_nodes WHERE id = ?", [res.body.id]);
    expect(rows[0].project_path).toBe("/home/u1/projects/orders-api");

    const schedule = await request(app).get("/api/workspaces/schedule").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(schedule.body.specs.find((s: { id: string }) => s.id === res.body.id).project_path).toBe(
      "/home/u1/projects/orders-api"
    );
  });

  it("projectPath 없이도 만들 수 있다(프로젝트 미지정)", async () => {
    const { app, db, auth } = await bootApp();
    const res = await request(app)
      .post("/api/workspaces/ws1/roadmap/quick-spec")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ title: "프로젝트 미정 스펙" })
      .expect(200);

    const rows = await db.query<{ project_path: string | null }>("SELECT project_path FROM sugo_roadmap_nodes WHERE id = ?", [res.body.id]);
    expect(rows[0].project_path).toBeNull();
  });
});

describe("POST /api/workspaces/:name/roadmap/project — §7B 스펙별 프로젝트 지정", () => {
  it("level='spec' 노드에 프로젝트를 지정하면 즉시 반영된다", async () => {
    const { app, db, auth } = await appWithNodesIn("ws1", [{ id: "spec1", level: "spec" }]);
    await request(app)
      .post("/api/workspaces/ws1/roadmap/project")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "spec1", projectPath: "/home/u1/projects/orders-api" })
      .expect(200);

    const rows = await db.query<{ project_path: string }>("SELECT project_path FROM sugo_roadmap_nodes WHERE id='spec1'");
    expect(rows[0].project_path).toBe("/home/u1/projects/orders-api");
  });

  it("null을 보내면 프로젝트 미지정으로 되돌린다", async () => {
    const { app, db, auth } = await appWithNodesIn("ws1", [{ id: "spec1", level: "spec" }]);
    await request(app)
      .post("/api/workspaces/ws1/roadmap/project")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "spec1", projectPath: "/home/u1/projects/orders-api" })
      .expect(200);
    await request(app)
      .post("/api/workspaces/ws1/roadmap/project")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "spec1", projectPath: null })
      .expect(200);

    const rows = await db.query<{ project_path: string | null }>("SELECT project_path FROM sugo_roadmap_nodes WHERE id='spec1'");
    expect(rows[0].project_path).toBeNull();
  });

  it("반드시 거부: level='spec'이 아닌 노드", async () => {
    const { app, auth } = await appWithNodesIn("ws1", [{ id: "task1", level: "task" }]);
    const res = await request(app)
      .post("/api/workspaces/ws1/roadmap/project")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "task1", projectPath: "/home/u1/projects/orders-api" })
      .expect(400);
    expect(res.body.errorCode).toBe("INVALID_LEVEL");
  });

  it("존재하지 않는 노드는 404", async () => {
    const { app, auth } = await appWithNodesIn("ws1", [{ id: "spec1", level: "spec" }]);
    const res = await request(app)
      .post("/api/workspaces/ws1/roadmap/project")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "nope", projectPath: "/home/u1/projects/orders-api" })
      .expect(404);
    expect(res.body.errorCode).toBe("NODE_NOT_FOUND");
  });

  it("CLI 재동기화(POST /api/sync/roadmap)는 대시보드가 지정한 project_path를 덮어쓰지 않는다", async () => {
    const { app, db, auth } = await appWithNodesIn("ws1", [{ id: "spec1", level: "spec" }]);
    await request(app)
      .post("/api/workspaces/ws1/roadmap/project")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "spec1", projectPath: "/home/u1/projects/orders-api" })
      .expect(200);

    await request(app)
      .post("/api/sync/roadmap")
      .set("Authorization", auth)
      .send({ userId: "u1", workspaceName: "ws1", nodes: [{ id: "spec1", title: "spec1(renamed)", level: "spec", status: "in_progress" }] });

    const rows = await db.query<{ project_path: string; title: string }>(
      "SELECT project_path, title FROM sugo_roadmap_nodes WHERE id='spec1'"
    );
    expect(rows[0].title).toBe("spec1(renamed)");
    expect(rows[0].project_path).toBe("/home/u1/projects/orders-api");
  });
});

describe("DELETE /api/workspaces/:name/roadmap/quick-spec — 수동 SPEC 삭제", () => {
  it("대시보드에서 만든 SPEC과 연결된 하위 계보를 함께 삭제한다", async () => {
    const { app, db, auth } = await bootApp();
    const created = await request(app)
      .post("/api/workspaces/ws1/roadmap/quick-spec")
      .set("Authorization", auth)
      .send({ title: "지울 일정" })
      .expect(200);
    await request(app).post("/api/sync/roadmap").set("Authorization", auth).send({
      userId: "u1", workspaceName: "ws1", nodes: [
        { id: created.body.id, title: "지울 일정", level: "spec", status: "in_progress" },
        { id: "run-delete", title: "RUN", level: "workstream", status: "in_progress", parent: created.body.id },
        { id: "task-delete", title: "TASK", level: "task", status: "in_progress", parent: "run-delete" },
      ],
    }).expect(200);

    const res = await request(app)
      .delete("/api/workspaces/ws1/roadmap/quick-spec")
      .set("Authorization", auth)
      .send({ nodeId: created.body.id })
      .expect(200);

    expect(res.body).toMatchObject({ ok: true, deletedCount: 3, filesPreserved: true });
    expect(await db.query("SELECT id FROM sugo_roadmap_nodes WHERE workspace_name = 'ws1'")).toEqual([]);
  });

  it("플러그인이 만든 정식 SPEC은 삭제를 거부한다", async () => {
    const { app, auth } = await appWithNodesIn("ws1", [{ id: "spec-official", level: "spec" }]);
    const res = await request(app)
      .delete("/api/workspaces/ws1/roadmap/quick-spec")
      .set("Authorization", auth)
      .send({ nodeId: "spec-official" })
      .expect(409);
    expect(res.body.errorCode).toBe("NOT_MANUAL_SPEC");
  });

  it("다른 사용자의 같은 ID는 삭제하지 않는다", async () => {
    const ctx = await bootApp();
    const otherAuth = await seedUserToken(ctx.db, "u2");
    await request(ctx.app).post("/api/workspaces/ws1/roadmap/quick-spec").set("Authorization", otherAuth)
      .send({ title: "다른 사용자" }).expect(200);
    const other = await ctx.db.query<{ id: string }>("SELECT id FROM sugo_roadmap_nodes WHERE user_id = 'u2'");

    await request(ctx.app).delete("/api/workspaces/ws1/roadmap/quick-spec").set("Authorization", ctx.auth)
      .send({ nodeId: other[0].id }).expect(404);
    expect(await ctx.db.query("SELECT id FROM sugo_roadmap_nodes WHERE user_id = 'u2'")).toHaveLength(1);
  });
});
