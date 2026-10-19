import { readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

async function boot() {
  const db = createSqliteClient();
  await db.execScript(schema);
  const auth = await seedUserToken(db, "commitment-owner");
  await db.exec("INSERT INTO sugo_workspaces (user_id, name) VALUES (?, ?)", ["commitment-owner", "orders"]);
  await db.exec(
    "INSERT INTO sugo_roadmap_nodes (id, user_id, workspace_name, title, level, status, due_date) VALUES (?, ?, ?, ?, 'spec', 'done', ?)",
    ["spec-1", "commitment-owner", "orders", "할 일 추가", "2026-10-14"],
  );
  const { app } = await createApp(db);
  return { app, db, auth };
}

describe("Schedule commitment API", () => {
  it("정식 SPEC도 삭제·종료 이유를 구분해 보관하고 복구한다", async () => {
    const { app, db, auth } = await boot();

    await db.exec(
      "INSERT INTO sugo_roadmap_nodes (id, user_id, workspace_name, title, level, status, parent) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ["closed-run", "commitment-owner", "orders", "종료 RUN", "workstream", "done", "spec-1"],
    );
    await db.exec(
      "INSERT INTO sugo_roadmap_nodes (id, user_id, workspace_name, title, level, status, parent) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ["closed-task", "commitment-owner", "orders", "종료 Task", "task", "in_progress", "closed-run"],
    );
    await db.exec(
      "INSERT INTO sugo_roadmap_nodes (id, user_id, workspace_name, title, level, status) VALUES (?, ?, ?, ?, ?, ?)",
      ["active-spec", "commitment-owner", "orders", "활성 SPEC", "spec", "done"],
    );
    await db.exec(
      "INSERT INTO sugo_roadmap_nodes (id, user_id, workspace_name, title, level, status, parent) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ["active-run", "commitment-owner", "orders", "활성 RUN", "workstream", "done", "active-spec"],
    );
    for (let i = 1; i <= 4; i++) await db.exec(
      "INSERT INTO sugo_roadmap_nodes (id, user_id, workspace_name, title, level, status, parent) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [`active-task-${i}`, "commitment-owner", "orders", `활성 Task ${i}`, "task", "done", "active-run"],
    );

    await request(app).post("/api/schedule/specs/archive").set("Authorization", auth).send({
      workspaceName: "orders", specId: "spec-1", reason: "closed",
    }).expect(200);

    const active = await request(app).get("/api/workspaces/schedule").set("Authorization", auth).expect(200);
    expect(active.body.specs.map((spec: { id: string }) => spec.id)).toEqual(["active-spec"]);
    const archive = await request(app).get("/api/schedule/specs/archive").set("Authorization", auth).expect(200);
    expect(archive.body.specs).toEqual([expect.objectContaining({
      workspace_name: "orders", spec_id: "spec-1", title: "할 일 추가", reason: "closed",
    })]);
    expect((await db.query<{ manual_status: string | null }>("SELECT manual_status FROM sugo_roadmap_nodes WHERE id = 'spec-1'"))[0].manual_status).toBeNull();
    const roadmap = await request(app).get("/api/workspaces/orders/roadmap").set("Authorization", auth).expect(200);
    expect(roadmap.body.nodes.map((node: { id: string }) => node.id)).not.toEqual(expect.arrayContaining(["spec-1", "closed-run", "closed-task"]));
    expect(roadmap.body.counts).toMatchObject({ done: 4, total: 4, in_progress: 0, dropped: 0 });

    await request(app).post("/api/schedule/specs/restore").set("Authorization", auth).send({
      workspaceName: "orders", specId: "spec-1",
    }).expect(200);
    expect((await request(app).get("/api/workspaces/schedule").set("Authorization", auth).expect(200)).body.specs).toHaveLength(2);
    expect((await request(app).get("/api/schedule/specs/archive").set("Authorization", auth).expect(200)).body.specs).toEqual([]);
  });

  it("Spec 상태와 독립된 작업 약속을 만들고 목록에서 돌려준다", async () => {
    const { app, auth } = await boot();
    const created = await request(app)
      .post("/api/schedule/commitments")
      .set("Authorization", auth)
      .send({
        workspaceName: "orders",
        specId: "spec-1",
        title: "PRD 배포 확인",
        dueDate: "2026-10-20",
        state: "planned",
        target: "prd",
        linkedRunId: "run-001",
      })
      .expect(201);

    expect(created.body.commitment).toMatchObject({
      workspace_name: "orders",
      spec_id: "spec-1",
      title: "PRD 배포 확인",
      due_date: "2026-10-20",
      state: "planned",
      target: "prd",
      linked_run_id: "run-001",
      completed_at: null,
      completed_by: null,
    });

    const list = await request(app).get("/api/schedule/commitments").set("Authorization", auth).expect(200);
    expect(list.body.commitments).toHaveLength(1);
    expect(list.body.commitments[0].id).toBe(created.body.commitment.id);
  });

  it("약속을 수정하고 완료한 뒤 다시 열 수 있다", async () => {
    const { app, auth } = await boot();
    const created = await request(app).post("/api/schedule/commitments").set("Authorization", auth).send({
      workspaceName: "orders", specId: "spec-1", title: "구현", dueDate: null, target: "implementation",
    }).expect(201);
    const path = `/api/schedule/commitments/${created.body.commitment.id}`;

    const updated = await request(app).put(path).set("Authorization", auth).send({
      title: "리뷰 확정", dueDate: "2026-10-22", state: "active", target: "review", linkedRunId: null,
    }).expect(200);
    expect(updated.body.commitment).toMatchObject({ title: "리뷰 확정", state: "active", target: "review" });

    const completed = await request(app).post(`${path}/complete`).set("Authorization", auth).expect(200);
    expect(completed.body.commitment.state).toBe("completed");
    expect(completed.body.commitment.completed_at).toBeTruthy();
    expect(completed.body.commitment.completed_by).toBe("commitment-owner");

    const reopened = await request(app).post(`${path}/reopen`).set("Authorization", auth).expect(200);
    expect(reopened.body.commitment).toMatchObject({ state: "active", completed_at: null, completed_by: null });
  });

  it("다른 사용자와 존재하지 않는 Spec을 거부하고 자신의 약속만 삭제한다", async () => {
    const { app, db, auth } = await boot();
    await request(app).post("/api/schedule/commitments").set("Authorization", auth).send({
      workspaceName: "orders", specId: "missing", title: "잘못된 약속", dueDate: null, target: "custom",
    }).expect(404);

    const created = await request(app).post("/api/schedule/commitments").set("Authorization", auth).send({
      workspaceName: "orders", specId: "spec-1", title: "내 약속", dueDate: null, target: "custom",
    }).expect(201);
    const other = await seedUserToken(db, "other-user");
    const path = `/api/schedule/commitments/${created.body.commitment.id}`;
    await request(app).post(`${path}/complete`).set("Authorization", other).expect(404);
    await request(app).delete(path).set("Authorization", other).expect(404);
    await request(app).delete(path).set("Authorization", auth).expect(200);
    expect((await request(app).get("/api/schedule/commitments").set("Authorization", auth).expect(200)).body.commitments).toEqual([]);
  });
});
