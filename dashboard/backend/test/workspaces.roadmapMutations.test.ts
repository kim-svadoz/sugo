import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

async function appWithNodes(nodes: Array<{ id: string; level: string; status?: string; dependsOn?: string[]; note?: string; humanBlocker?: unknown; runtimeAssessment?: unknown }>) {
  const db = createSqliteClient();
  await db.execScript(schema);
  const { app } = await createApp(db);
  const auth = await seedUserToken(db, "u1");
  await request(app)
    .post("/api/sync/roadmap").set("Authorization", auth)
    .send({
      userId: "u1",
      workspaceName: "ws1",
      nodes: nodes.map((n) => ({ id: n.id, title: n.id, level: n.level, status: n.status ?? "pending", dependsOn: n.dependsOn, note: n.note, humanBlocker: n.humanBlocker, runtimeAssessment: n.runtimeAssessment })),
    });
  return { app, db, auth };
}

describe("blocked task decision", () => {
  it("round-trips the plugin runtime assessment and old-plugin re-sync does not erase it", async () => {
    const runtimeAssessment = {
      projectionSchemaVersion: 1, status: "blocked", currentStage: "CODE_RUNNING",
      nextActions: [], recommendedAction: null, humanDecisionRequired: true,
      blockers: ["승인 필요"], evidence: [], blockingReason: "승인 필요",
    };
    const { app, auth } = await appWithNodes([{ id: "assessed-task", level: "task", status: "blocked", runtimeAssessment }]);

    await request(app)
      .post("/api/sync/roadmap").set("Authorization", auth)
      .send({ userId: "u1", workspaceName: "ws1", nodes: [{ id: "assessed-task", title: "assessed-task", level: "task", status: "blocked" }] })
      .expect(200);

    const roadmap = await request(app).get("/api/workspaces/ws1/roadmap").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(roadmap.body.nodes.find((node: { id: string }) => node.id === "assessed-task").runtime_assessment).toEqual(runtimeAssessment);
  });

  it("stores a human decision without pretending that the task resumed, and survives plugin re-sync", async () => {
    const humanBlocker = { schemaVersion: 1, sessionId: "plan-1", stage: "CODE_RUNNING", resumeAction: "code_done", summary: "비밀번호 재설정 구현 중", question: "재설정 링크 유효 시간은?", context: ["기준 없음"], options: [{ id: "short", label: "30분", impact: "보안 강화" }], blockedNextStep: "토큰 만료 처리", createdAt: "2026-09-29" };
    const { app, auth } = await appWithNodes([{ id: "blocked-task", level: "task", status: "blocked", note: "링크 유효 시간 미정", humanBlocker }]);

    await request(app)
      .post("/api/workspaces/ws1/roadmap/blocker-decision")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "blocked-task", response: "재설정 링크는 30분 뒤 만료한다." })
      .expect(200);

    await request(app)
      .post("/api/sync/roadmap").set("Authorization", auth)
      .send({ userId: "u1", workspaceName: "ws1", nodes: [{ id: "blocked-task", title: "blocked-task", level: "task", status: "blocked", note: "링크 유효 시간 미정", humanBlocker }] })
      .expect(200);

    const roadmap = await request(app).get("/api/workspaces/ws1/roadmap").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    const task = roadmap.body.nodes.find((node: { id: string }) => node.id === "blocked-task");
    expect(task.status).toBe("blocked");
    expect(task.manual_status).toBeNull();
    expect(task.blocker_decision).toMatchObject({ response: "재설정 링크는 30분 뒤 만료한다.", answered_by: "u1" });
    expect(task.human_blocker).toMatchObject({ sessionId: "plan-1", resumeAction: "code_done" });

    const decision = await request(app).get("/api/workspaces/ws1/roadmap/blocker-decision").query({ userId: "u1", nodeId: "blocked-task" }).set("Authorization", auth).expect(200);
    expect(decision.body).toMatchObject({ blocker: { sessionId: "plan-1" }, decision: { response: "재설정 링크는 30분 뒤 만료한다." } });
  });

  it("플러그인이 결정을 소비해 작업을 재개하면 저장된 답변을 비운다", async () => {
    const humanBlocker = { schemaVersion: 1, sessionId: "plan-1", stage: "REVIEW_RUNNING", resumeAction: "review_done", summary: "검토", question: "진행?", context: [], options: [], blockedNextStep: "검토", createdAt: "2026-10-21" };
    const { app, auth } = await appWithNodes([{ id: "review-task", level: "task", status: "blocked", humanBlocker }]);
    await request(app).post("/api/workspaces/ws1/roadmap/blocker-decision").query({ userId: "u1" }).set("Authorization", auth).send({ nodeId: "review-task", response: "수정해 주세요" }).expect(200);

    await request(app).post("/api/sync/roadmap").set("Authorization", auth).send({ userId: "u1", workspaceName: "ws1", nodes: [{ id: "review-task", title: "review-task", level: "task", status: "in_progress" }] }).expect(200);

    const roadmap = await request(app).get("/api/workspaces/ws1/roadmap").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    const task = roadmap.body.nodes.find((node: { id: string }) => node.id === "review-task");
    expect(task.blocker_decision).toBeNull();
    expect(task.human_blocker).toBeNull();
  });

  it("rejects decisions for a task that is not blocked", async () => {
    const { app, auth } = await appWithNodes([{ id: "active-task", level: "task", status: "in_progress" }]);
    const response = await request(app)
      .post("/api/workspaces/ws1/roadmap/blocker-decision")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "active-task", response: "결정" })
      .expect(409);
    expect(response.body.errorCode).toBe("TASK_NOT_BLOCKED");
  });
});

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

    // 플러그인이 보낸 title(CLI 진실)은 그대로, manual_title에만 저장된다 — manual_status와 같은
    // 오버레이 패턴. GET /roadmap이 돌려주는 title은 이미 유효값으로 합쳐진 것.
    const rows = await db.query("SELECT title, manual_title, parent FROM sugo_roadmap_nodes WHERE id='a'");
    expect(rows).toEqual([{ title: "a", manual_title: "New Title", parent: "ws-grp" }]);

    const roadmap = await request(app).get("/api/workspaces/ws1/roadmap").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(roadmap.body.nodes.find((n: { id: string }) => n.id === "a").title).toBe("New Title");
  });

  it("CLI 재동기화가 대시보드에서 바꾼 이름을 되돌리지 않는다", async () => {
    const { app, db, auth } = await appWithNodes([{ id: "a", level: "task" }]);
    await request(app)
      .post("/api/workspaces/ws1/roadmap/rename")
      .query({ userId: "u1" }).set("Authorization", auth)
      .send({ nodeId: "a", title: "대시보드에서 바꾼 이름" })
      .expect(200);

    await request(app)
      .post("/api/sync/roadmap")
      .set("Authorization", auth)
      .send({ userId: "u1", workspaceName: "ws1", nodes: [{ id: "a", title: "a", level: "task", status: "in_progress" }] });

    const rows = await db.query<{ title: string; manual_title: string }>("SELECT title, manual_title FROM sugo_roadmap_nodes WHERE id='a'");
    expect(rows[0].title).toBe("a");
    expect(rows[0].manual_title).toBe("대시보드에서 바꾼 이름");

    const roadmap = await request(app).get("/api/workspaces/ws1/roadmap").query({ userId: "u1" }).set("Authorization", auth).expect(200);
    expect(roadmap.body.nodes.find((n: { id: string }) => n.id === "a").title).toBe("대시보드에서 바꾼 이름");
  });
});
