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
  const { app } = await createApp(db);
  return { app, db, auth: await seedUserToken(db, "memo-owner") };
}

describe("Schedule memo API", () => {
  it("워크스페이스 없이 Markdown 메모를 생성하고 날짜를 이동한다", async () => {
    const { app, auth } = await boot();
    const created = await request(app).post("/api/schedule/memos").set("Authorization", auth).send({
      title: "릴리스 확인", contentMd: "## 확인\n- 배포 상태", dueDate: null,
    }).expect(201);
    expect(created.body.memo).toMatchObject({ title: "릴리스 확인", content_md: "## 확인\n- 배포 상태", due_date: null });
    expect(created.body.memo).not.toHaveProperty("workspace_name");

    await request(app).patch(`/api/schedule/memos/${created.body.memo.id}/due-date`).set("Authorization", auth).send({ dueDate: "2026-10-20" }).expect(200);
    const list = await request(app).get("/api/schedule/memos").set("Authorization", auth).expect(200);
    expect(list.body.memos).toHaveLength(1);
    expect(list.body.memos[0].due_date).toBe("2026-10-20");
  });

  it("다른 사용자의 메모는 조회·수정·삭제할 수 없다", async () => {
    const { app, db, auth } = await boot();
    const created = await request(app).post("/api/schedule/memos").set("Authorization", auth).send({ title: "비공개", contentMd: "내용", dueDate: null }).expect(201);
    const other = await seedUserToken(db, "other-user");
    expect((await request(app).get("/api/schedule/memos").set("Authorization", other).expect(200)).body.memos).toEqual([]);
    await request(app).put(`/api/schedule/memos/${created.body.memo.id}`).set("Authorization", other).send({ title: "변조", contentMd: "x", dueDate: null }).expect(404);
    await request(app).delete(`/api/schedule/memos/${created.body.memo.id}`).set("Authorization", other).expect(404);
  });

  it("삭제한 메모를 보관함에서 조회하고 원문 그대로 복구한다", async () => {
    const { app, auth } = await boot();
    const created = await request(app).post("/api/schedule/memos").set("Authorization", auth).send({
      title: "배포 메모", contentMd: "## 확인\n- STG 로그", dueDate: "2026-10-23",
    }).expect(201);

    await request(app).delete(`/api/schedule/memos/${created.body.memo.id}`).set("Authorization", auth).expect(200);
    expect((await request(app).get("/api/schedule/memos").set("Authorization", auth).expect(200)).body.memos).toEqual([]);

    const archived = await request(app).get("/api/schedule/memos/archive").set("Authorization", auth).expect(200);
    expect(archived.body.memos).toEqual([expect.objectContaining({
      id: created.body.memo.id,
      title: "배포 메모",
      content_md: "## 확인\n- STG 로그",
      due_date: "2026-10-23",
      archived_at: expect.any(String),
    })]);

    await request(app).post(`/api/schedule/memos/${created.body.memo.id}/restore`).set("Authorization", auth).expect(200);
    expect((await request(app).get("/api/schedule/memos/archive").set("Authorization", auth).expect(200)).body.memos).toEqual([]);
    expect((await request(app).get("/api/schedule/memos").set("Authorization", auth).expect(200)).body.memos)
      .toEqual([expect.objectContaining({ title: "배포 메모", content_md: "## 확인\n- STG 로그", due_date: "2026-10-23" })]);
  });
});
