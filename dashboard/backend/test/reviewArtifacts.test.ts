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
      path: "src/app.ts", change: "modified", content: "const next = true;", diff: "-false\n+true", schemaVersion: 1,
    }).expect(200);
    const own = await request(app).get("/api/workspaces/ws/review-artifact").set("Authorization", auth1)
      .query({ taskId: "task-1", path: "src/app.ts", sessionId: "session-1" }).expect(200);
    expect(own.body.artifact).toMatchObject({ path: "src/app.ts", content: "const next = true;", diff: "-false\n+true" });
    await request(app).get("/api/workspaces/ws/review-artifact").set("Authorization", auth2)
      .query({ taskId: "task-1", path: "src/app.ts", sessionId: "session-1" }).expect(404);
    await db.close();
  });

  it("modified 아티팩트의 diff가 비면 이전 차수 본문으로 diff를 복원한다", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    const { app } = await createApp(db);
    const auth = await seedUserToken(db, "u1");
    for (const artifact of [
      { sessionId: "feat", patchVersion: 0, content: "class A {\n  int value = 1;\n}\n", diff: "-old\n+feat" },
      { sessionId: "patch", patchVersion: 1, content: "class A {\n  int value = 2;\n}\n" },
    ]) {
      await request(app).post("/api/sync/review-artifact").set("Authorization", auth).send({
        workspaceName: "ws", taskId: "task-1", path: "src/A.java", change: "modified", schemaVersion: 1, ...artifact,
      }).expect(200);
    }

    const result = await request(app).get("/api/workspaces/ws/review-artifact").set("Authorization", auth)
      .query({ taskId: "task-1", path: "src/A.java", patchVersion: 1 }).expect(200);
    expect(result.body.artifact.diff).toContain("-  int value = 1;");
    expect(result.body.artifact.diff).toContain("+  int value = 2;");
    await db.close();
  });
});
