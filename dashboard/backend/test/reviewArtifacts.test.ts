import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

describe("review artifact API", () => {
  it("토큰 사용자에게만 파일 diff를 저장하고 지연 조회한다", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    const { app } = await createApp(db);
    const auth1 = await seedUserToken(db, "u1");
    const auth2 = await seedUserToken(db, "u2");
    await request(app).post("/api/sync/review-artifact").set("Authorization", auth1).send({
      userId: "forged", workspaceName: "ws", taskId: "task-1", sessionId: "session-1", patchVersion: 2,
      path: "src/app.ts", change: "modified", content: "const next = true;", diff: "-false\n+true",
    }).expect(200);
    const own = await request(app).get("/api/workspaces/ws/review-artifact").set("Authorization", auth1)
      .query({ taskId: "task-1", path: "src/app.ts", sessionId: "session-1" }).expect(200);
    expect(own.body.artifact).toMatchObject({ path: "src/app.ts", content: "const next = true;", diff: "-false\n+true" });
    await request(app).get("/api/workspaces/ws/review-artifact").set("Authorization", auth2)
      .query({ taskId: "task-1", path: "src/app.ts", sessionId: "session-1" }).expect(404);
    await db.close();
  });
});
