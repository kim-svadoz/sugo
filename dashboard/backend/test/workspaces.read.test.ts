import { readFileSync } from "node:fs";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";
import { __resetCheckpointCreatedAtColState, __resetCheckpointExpiresAtColState, ensureCheckpointCreatedAtColumn, ensureCheckpointExpiresAtColumn } from "../src/services/syncService.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

async function seededApp() {
  const db = createSqliteClient();
  await db.execScript(schema);
  const { app } = await createApp(db);
  const auth = await seedUserToken(db, "u1");

  await request(app)
    .post("/api/sync/workspace").set("Authorization", auth)
    .send({ userId: "u1", name: "ws1", projects: ["C:/a"], gitSyncedProjects: ["C:/a"] });
  await request(app)
    .post("/api/sync/task").set("Authorization", auth)
    .send({ userId: "u1", workspaceName: "ws1", id: "t1", title: "Task 1", status: "in_progress" });
  await request(app)
    .post("/api/sync/task").set("Authorization", auth)
    .send({ userId: "u1", workspaceName: "ws1", id: "t2", title: "Task 2", status: "done" });
  await request(app)
    .post("/api/sync/roadmap").set("Authorization", auth)
    .send({
      userId: "u1",
      workspaceName: "ws1",
      nodes: [
        { id: "spec-1", title: "현재 SPEC 제목", level: "spec", status: "done" },
        { id: "run-1", title: "Run 1", level: "workstream", status: "done", parent: "spec-1" },
        { id: "t1", title: "Task 1", level: "task", status: "in_progress", parent: "run-1" },
        { id: "t2", title: "Task 2", level: "task", status: "done", parent: "run-1" },
      ],
    });
  await request(app)
    .post("/api/sync/history").set("Authorization", auth)
    .send({ userId: "u1", workspaceName: "ws1", id: "h1", taskId: "t2", taskTitle: "저장 당시 제목", summary: "finished the thing" });
  await request(app)
    .post("/api/sync/decision").set("Authorization", auth)
    .send({ userId: "u1", workspaceName: "ws1", id: "d1", title: "Use SQLite locally" });
  await request(app)
    .post("/api/sync/checkpoint").set("Authorization", auth)
    .send({ userId: "u1", workspaceName: "ws1", id: "CP-001", title: "watch out" });

  return { app, db, auth };
}

describe("GET /api/workspaces", () => {
  it("lists workspaces with task counts and roadmap counts", async () => {
    const { app, db, auth } = await seededApp();
    await db.exec("INSERT INTO sugo_checkpoints (id, user_id, workspace_name, category, title, expires_at) VALUES ('CP-timed','u1','ws1','general','temporary','2026-10-20')");
    const res = await request(app).get("/api/workspaces").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(res.body.workspaces).toHaveLength(1);
    const ws = res.body.workspaces[0];
    expect(ws.name).toBe("ws1");
    expect(ws.projects).toEqual([{
      project_path: "C:/a", git_synced: 1, aws_synced: 0, aws_deployments: [], aws_release: null,
      local_git: { branch: null, headCommit: null, baseCommit: null, dirty: false },
    }]);
    expect(ws.taskCounts).toEqual({ pending: 0, in_progress: 1, done: 1, archived: 0 });
    expect(ws.roadmap).toEqual({ total: 2, done: 1, active: 1 });
    expect(ws.attentionCount).toBe(0);
    expect(ws.checkpointCount).toBe(1);
  });

  it("adds AWS synced ECS deployments to matching repositories", async () => {
    const { app, db, auth } = await seededApp();
    await db.exec("UPDATE sugo_workspace_projects SET project_path = '/work/orders-api' WHERE project_path = 'C:/a'");
    await db.exec("INSERT INTO user_aws_context_accounts (user_id, name, profile, region, account_id, principal_arn, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", ["u1", "team-dev", "team-dev", "ap-northeast-2", "111111111111", "arn:aws:iam::111111111111:user/dev", "2026-09-29T00:00:00.000Z"]);
    await db.exec("INSERT INTO user_aws_context_snapshots (user_id, account_name, payload, observed_at) VALUES (?, ?, ?, ?)", ["u1", "team-dev", JSON.stringify([{ service: "ecs", resources: [{ service: "ecs", kind: "service", id: "orders-api-service", metadata: { cluster: "shop-api-cluster", taskDefinition: "orders-api:343", revision: 343, rolloutState: "COMPLETED", desiredCount: 1, runningCount: 1 } }] }]), "2026-09-29T00:00:00.000Z"]);
    const res = await request(app).get("/api/workspaces").set("Authorization", auth).expect(200);
    expect(res.body.workspaces[0].projects[0]).toMatchObject({ aws_synced: 1, aws_deployments: [{ environment: "dev", revision: 343, service: "orders-api-service" }] });
  });

  it("차단·정체·미검증 완료 Task를 확인 필요 건수로 집계한다", async () => {
    const { app, db, auth } = await seededApp();
    await db.exec("UPDATE sugo_roadmap_nodes SET status = 'blocked', note = '정책 확인 대기' WHERE id = 't1'");
    await db.exec("UPDATE sugo_roadmap_nodes SET work_result = ? WHERE id = 't2'", [JSON.stringify({ report: { completionGrade: "unverified" } })]);
    const res = await request(app).get("/api/workspaces").set("Authorization", auth).expect(200);
    expect(res.body.workspaces[0]).toMatchObject({ attentionCount: 2, attentionLabel: "차단 1건" });
  });

  it("Workspace 요약도 raw status보다 versioned runtime assessment를 우선한다", async () => {
    const { app, db, auth } = await seededApp();
    await db.exec("UPDATE sugo_roadmap_nodes SET runtime_assessment = ? WHERE id = 't1'", [JSON.stringify({
      projectionSchemaVersion: 1, status: "completed", currentStage: "DONE", nextActions: [],
      recommendedAction: null, humanDecisionRequired: false, blockers: [], evidence: [],
    })]);
    const res = await request(app).get("/api/workspaces").set("Authorization", auth).expect(200);
    expect(res.body.workspaces[0].roadmap).toEqual({ total: 2, done: 2, active: 0 });
  });

  it("401s without an API token", async () => {
    const { app } = await seededApp();
    await request(app).get("/api/workspaces").expect(401);
  });
});

describe("GET /api/workspaces/recent-history and /search", () => {
  it("returns recent history entries", async () => {
    const { app, auth } = await seededApp();
    const res = await request(app).get("/api/workspaces/recent-history").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.history[0].summary).toBe("finished the thing");
  });

  it("searches by task title/summary", async () => {
    const { app, auth } = await seededApp();
    const res = await request(app)
      .get("/api/workspaces/search")
      .query({ userId: "u1", q: "finished" }).set("Authorization", auth)
      .expect(200);
    expect(res.body.results).toHaveLength(1);
  });
});

describe("GET /api/workspaces/checkpoint-sync", () => {
  it("returns all checkpoints across workspaces for the user", async () => {
    const { app, auth } = await seededApp();
    const res = await request(app).get("/api/workspaces/checkpoint-sync").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(res.body.checkpoints).toEqual([
      expect.objectContaining({ id: "CP-001", workspace_name: "ws1", title: "watch out" }),
    ]);
  });
  it("workspace 쿼리가 있으면 다른 도메인의 체크포인트를 섞지 않는다", async () => {
    const { app, auth } = await seededApp();
    const res = await request(app).get("/api/workspaces/checkpoint-sync").query({ userId: "u1", workspace: "other" }).set("Authorization", auth).expect(200);
    expect(res.body.checkpoints).toEqual([]);
  });
});

describe("GET /api/workspaces/:name/{decisions,history,checkpoints,tasks,roadmap}", () => {
  it("returns per-workspace data", async () => {
    const { app, db, auth } = await seededApp();
    const decisions = await request(app).get("/api/workspaces/ws1/decisions").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(decisions.body.decisions).toHaveLength(1);

    const tasks = await request(app).get("/api/workspaces/ws1/tasks").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(tasks.body.tasks).toHaveLength(2);

    const roadmap = await request(app).get("/api/workspaces/ws1/roadmap").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(roadmap.body.nodes).toHaveLength(4);

    const history = await request(app).get("/api/workspaces/ws1/history").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(history.body.history[0]).toMatchObject({ task_title: "저장 당시 제목", spec_title: "현재 SPEC 제목" });

    await db.exec("UPDATE sugo_roadmap_nodes SET manual_title = ? WHERE id = ?", ["수정한 SPEC 제목", "spec-1"]);
    const renamed = await request(app).get("/api/workspaces/ws1/history").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(renamed.body.history[0].spec_title).toBe("수정한 SPEC 제목");
  });
});

describe("checkpoint CRUD via dashboard (§3.3)", () => {
  it("creates, updates, and deletes a checkpoint", async () => {
    const { app, db, auth } = await seededApp();
    await request(app)
      .post("/api/workspaces/ws1/checkpoints")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ id: "CP-002", title: "new one", expiresAt: "2026-10-02" })
      .expect(200);

    await request(app)
      .put("/api/workspaces/ws1/checkpoints/CP-002")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ title: "updated title", expiresAt: null })
      .expect(200);
    let rows = await db.query("SELECT title, expires_at FROM sugo_checkpoints WHERE id='CP-002'");
    expect(rows).toEqual([{ title: "updated title", expires_at: null }]);

    await request(app).delete("/api/workspaces/ws1/checkpoints/CP-002").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    rows = await db.query("SELECT * FROM sugo_checkpoints WHERE id='CP-002'");
    expect(rows).toEqual([]);
  });

  it("생성하면 created_at이 즉시 채워진다(페이지네이션 정렬 기준)", async () => {
    const { app, db, auth } = await seededApp();
    await request(app)
      .post("/api/workspaces/ws1/checkpoints")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ id: "CP-003", title: "dated" })
      .expect(200);
    const rows = await db.query<{ created_at: string | null }>("SELECT created_at FROM sugo_checkpoints WHERE id='CP-003'");
    expect(rows[0].created_at).not.toBeNull();
  });
});

/**
 * §3.3 `ensureCheckpointCreatedAtColumn` 자가보강 — schema.sqlite.sql로 만든 테이블은 이미
 * created_at이 있어서(CREATE TABLE 안에 DEFAULT CURRENT_TIMESTAMP로 선언) 다른 모든 테스트가
 * ALTER 경로를 절대 타지 않는다. 실제 버그(2026-09-23, `ensureWorkspaceDeletedAtColumn`과
 * 같은 패턴으로 이 자가보강만 없이 배포된 기존 로컬 DB에서 재현)는 여기서만 잡힌다 —
 * ALTER TABLE ADD COLUMN에 CURRENT_TIMESTAMP 같은 비상수 DEFAULT를 주면 sqlite가 거부한다.
 */
describe("§3.3 ensureCheckpointCreatedAtColumn — 자가보강(구 DB 업그레이드 경로)", () => {
  it("컬럼이 없는 기존 테이블에도 ALTER로 추가되고, 기존 행도 백필된다", async () => {
    __resetCheckpointCreatedAtColState();
    const db = createSqliteClient();
    await db.exec("CREATE TABLE sugo_checkpoints (id TEXT PRIMARY KEY, user_id TEXT, workspace_name TEXT, category TEXT, title TEXT)");
    await db.exec("INSERT INTO sugo_checkpoints (id, user_id, workspace_name, category, title) VALUES ('CP-old','u1','ws1','general','기존 행')");

    expect(await ensureCheckpointCreatedAtColumn(db)).toBe(true);
    const rows = await db.query<{ created_at: string | null }>("SELECT created_at FROM sugo_checkpoints WHERE id='CP-old'");
    expect(rows[0].created_at).not.toBeNull();
    await db.close();
  });
});

describe("§3.3 ensureCheckpointExpiresAtColumn — 자가보강", () => {
  it("기존 테이블에 nullable expires_at을 추가한다", async () => {
    __resetCheckpointExpiresAtColState();
    const db = createSqliteClient();
    await db.exec("CREATE TABLE sugo_checkpoints (id TEXT PRIMARY KEY, user_id TEXT, workspace_name TEXT, category TEXT, title TEXT)");
    expect(await ensureCheckpointExpiresAtColumn(db)).toBe(true);
    const rows = await db.query<{ expires_at: string | null }>("SELECT expires_at FROM sugo_checkpoints");
    expect(rows).toEqual([]);
    await db.close();
  });
});

describe("POST /api/workspaces/:name/checkpoints/apply — §7B 프로젝트 스코프", () => {
  it("applies_to가 있으면 그 프로젝트에만 파일을 쓴다 — 워크스페이스 전체로 되돌아가지 않는다", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    const { app } = await createApp(db);
    const auth = await seedUserToken(db, "u1");
    const projectA = await mkdtemp(join(tmpdir(), "sugo-apply-a-"));
    const projectB = await mkdtemp(join(tmpdir(), "sugo-apply-b-"));

    await request(app)
      .post("/api/sync/workspace").set("Authorization", auth)
      .send({ userId: "u1", name: "ws-scoped", projects: [projectA, projectB] });
    await request(app)
      .post("/api/workspaces/ws-scoped/checkpoints")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ id: "CP-scoped", title: "프로젝트 전용 규칙", category: "general", learnedFrom: "본문", appliesTo: [basename(projectA)] })
      .expect(200);

    const res = await request(app)
      .post("/api/workspaces/ws-scoped/checkpoints/apply")
      .query({ userId: "u1" }).set("Authorization", auth)
      .expect(200);

    expect(res.body.filesWritten).toBe(1);
    await expect(readdir(join(projectA, ".claude", "rules", "general"))).resolves.toHaveLength(1);
    await expect(readdir(join(projectB, ".claude"))).rejects.toThrow();
  });
});
