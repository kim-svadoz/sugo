import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

describe("Schedule SPEC 기획 화면 첨부", () => {
  let root: string;
  let ctx: { app: import("express").Express; db: ReturnType<typeof createSqliteClient>; auth: string };

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), "sugo-spec-attach-"));
    const db = createSqliteClient();
    await db.execScript(schema);
    const { app } = await createApp({ db, specAttachmentsPath: join(root, "attachments") });
    const auth = await seedUserToken(db, "u1");
    ctx = { app, db, auth };
    const created = await request(app).post("/api/workspaces/ws1/roadmap/quick-spec").set("Authorization", auth).send({ title: "화면 첨부" }).expect(200);
    nodeId = created.body.id;
  });
  let nodeId = "";

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  const upload = (body: Buffer, type = "image/png") =>
    request(ctx.app).post("/api/workspaces/ws1/roadmap/spec-attachments").query({ nodeId }).set("Authorization", ctx.auth).set("Content-Type", type).send(body);

  it("붙여 넣은 이미지를 순번 이름으로 저장하고 절대 경로와 함께 목록·원본을 돌려준다", async () => {
    expect((await upload(PNG).expect(200)).body.name).toBe("01.png");
    expect((await upload(PNG, "image/jpeg").expect(200)).body.name).toBe("02.jpg");
    const list = await request(ctx.app).get("/api/workspaces/ws1/roadmap/spec-attachments").query({ nodeId }).set("Authorization", ctx.auth).expect(200);
    expect(list.body.locked).toBe(false);
    expect(list.body.attachments.map((a: { name: string }) => a.name)).toEqual(["01.png", "02.jpg"]);
    expect(readFileSync(list.body.attachments[0].path)).toEqual(PNG);
    const file = await request(ctx.app).get("/api/workspaces/ws1/roadmap/spec-attachments/file").query({ nodeId, name: "01.png" }).set("Authorization", ctx.auth).expect(200);
    expect(file.headers["content-type"]).toContain("image/png");
  });

  it("이미지가 아닌 본문과 이름 패턴 밖 파일 요청은 거부한다", async () => {
    await upload(Buffer.from("hello"), "text/plain").expect(400);
    await request(ctx.app).get("/api/workspaces/ws1/roadmap/spec-attachments/file").query({ nodeId, name: "../../etc/passwd" }).set("Authorization", ctx.auth).expect(404);
  });

  it("feat RUN이 생긴 뒤에는 추가·삭제를 409로 막고 조회만 허용한다", async () => {
    await upload(PNG).expect(200);
    await request(ctx.app).post("/api/sync/roadmap").set("Authorization", ctx.auth)
      .send({ userId: "u1", workspaceName: "ws1", nodes: [{ id: "run1", title: "run1", level: "workstream", status: "pending" }] });
    await ctx.db.exec("UPDATE sugo_roadmap_nodes SET parent = ? WHERE id = ?", [nodeId, "run1"]);
    expect((await upload(PNG).expect(409)).body.errorCode).toBe("SPEC_LOCKED_AFTER_FEAT");
    await request(ctx.app).delete("/api/workspaces/ws1/roadmap/spec-attachments").query({ nodeId, name: "01.png" }).set("Authorization", ctx.auth).expect(409);
    const list = await request(ctx.app).get("/api/workspaces/ws1/roadmap/spec-attachments").query({ nodeId }).set("Authorization", ctx.auth).expect(200);
    expect(list.body).toMatchObject({ locked: true, attachments: [{ name: "01.png" }] });
  });

  it("삭제하면 목록에서 빠지고, SPEC을 지우면 첨부 디렉터리도 지운다", async () => {
    await upload(PNG).expect(200);
    await upload(PNG).expect(200);
    await request(ctx.app).delete("/api/workspaces/ws1/roadmap/spec-attachments").query({ nodeId, name: "01.png" }).set("Authorization", ctx.auth).expect(200);
    const list = await request(ctx.app).get("/api/workspaces/ws1/roadmap/spec-attachments").query({ nodeId }).set("Authorization", ctx.auth).expect(200);
    expect(list.body.attachments.map((a: { name: string }) => a.name)).toEqual(["02.png"]);
    const dir = join(list.body.attachments[0].path, "..");
    await request(ctx.app).delete("/api/workspaces/ws1/roadmap/quick-spec").set("Authorization", ctx.auth).send({ nodeId }).expect(200);
    expect(existsSync(dir)).toBe(false);
  });
});

describe("GET spec-document/asset — spec.md 상대경로 이미지", () => {
  it("spec.md 디렉터리 안의 이미지만 돌려주고 밖으로 나가는 경로는 거부한다", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sugo-spec-asset-"));
    try {
      mkdirSync(join(dir, "v1", "images"), { recursive: true });
      writeFileSync(join(dir, "v1", "spec.md"), "![화면](images/01.png)\n");
      writeFileSync(join(dir, "v1", "images", "01.png"), PNG);
      writeFileSync(join(dir, "outside.png"), PNG);
      const db = createSqliteClient();
      await db.execScript(schema);
      const { app } = await createApp({ db, specAttachmentsPath: join(dir, "att") });
      const auth = await seedUserToken(db, "u1");
      const created = await request(app).post("/api/workspaces/ws1/roadmap/quick-spec").set("Authorization", auth).send({ title: "t" }).expect(200);
      await db.exec("UPDATE sugo_roadmap_nodes SET spec_path = ? WHERE id = ?", [join(dir, "v1", "spec.md"), created.body.id]);
      const ok = await request(app).get("/api/workspaces/ws1/roadmap/spec-document/asset").query({ nodeId: created.body.id, path: "images/01.png" }).set("Authorization", auth).expect(200);
      expect(ok.headers["content-type"]).toContain("image/png");
      await request(app).get("/api/workspaces/ws1/roadmap/spec-document/asset").query({ nodeId: created.body.id, path: "../outside.png" }).set("Authorization", auth).expect(404);
      await request(app).get("/api/workspaces/ws1/roadmap/spec-document/asset").query({ nodeId: created.body.id, path: "spec.md" }).set("Authorization", auth).expect(404);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
