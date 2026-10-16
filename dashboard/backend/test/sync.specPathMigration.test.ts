import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

describe("POST /api/sync/spec-path-migration", () => {
  it("인증 사용자의 일치하는 SPEC 경로만 새 위치로 바꾼다", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    const { app } = await createApp(db);
    const auth = await seedUserToken(db, "u1");
    await request(app).post("/api/sync/roadmap").set("Authorization", auth).send({
      userId: "u1",
      workspaceName: "ws",
      nodes: [{ id: "spec-1", title: "S", level: "spec", status: "done", specPath: "/old/spec.md" }],
    }).expect(200);

    const response = await request(app).post("/api/sync/spec-path-migration").set("Authorization", auth).send({
      userId: "attacker-is-ignored",
      mappings: [{ from: "/old/spec.md", to: "/new/spec.md" }],
    }).expect(200);

    expect(response.body).toEqual({ ok: true, updated: 1 });
    const rows = await db.query<{ spec_path: string }>("SELECT spec_path FROM sugo_roadmap_nodes WHERE user_id = ?", ["u1"]);
    expect(rows[0].spec_path).toBe("/new/spec.md");
    await db.close();
  });

  it("인증 없이는 경로를 바꿀 수 없다", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    const { app } = await createApp(db);
    await request(app).post("/api/sync/spec-path-migration").send({
      userId: "u1",
      mappings: [{ from: "/old/spec.md", to: "/new/spec.md" }],
    }).expect(401);
    await db.close();
  });
});
