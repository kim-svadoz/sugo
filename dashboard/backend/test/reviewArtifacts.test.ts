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

  it("modified로 보고됐지만 이전 차수와 본문이 같으면 변경 없음으로 정정한다", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    const { app } = await createApp(db);
    const auth = await seedUserToken(db, "u1");
    for (const patchVersion of [0, 1]) await request(app).post("/api/sync/review-artifact").set("Authorization", auth).send({
      workspaceName: "ws", taskId: "task-1", sessionId: `s${patchVersion}`, patchVersion,
      path: "src/Same.java", change: patchVersion === 0 ? "added" : "modified",
      content: "class Same {}\n", schemaVersion: 1,
    }).expect(200);

    const result = await request(app).get("/api/workspaces/ws/review-artifact").set("Authorization", auth)
      .query({ taskId: "task-1", path: "src/Same.java", patchVersion: 1 }).expect(200);
    expect(result.body.artifact).toMatchObject({ changeType: "unchanged", diff: null, unavailableReason: "이 patch에서는 파일 내용이 바뀌지 않았습니다." });
    await request(app).post("/api/sync/review-artifact").set("Authorization", auth).send({
      workspaceName: "ws", taskId: "task-1", sessionId: "patch", patchVersion: 1,
      path: "src/NoBase.java", change: "modified", content: "class NoBase {}\n", schemaVersion: 1,
    }).expect(200);

    const noBaseResult = await request(app).get("/api/workspaces/ws/review-artifact").set("Authorization", auth)
      .query({ taskId: "task-1", path: "src/NoBase.java", patchVersion: 1 }).expect(200);
    expect(noBaseResult.body.artifact).toMatchObject({
      changeType: "modified",
      diff: null,
      unavailableReason: "비교할 이전 차수의 본문이 없어 diff를 만들 수 없습니다.",
    });
    await db.close();
  });
});
