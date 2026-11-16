import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";
import { ensureReviewArtifactRoundColumn } from "../src/services/reviewArtifacts.js";

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
      unavailableReason: null,
    });
    expect(noBaseResult.body.artifact.diff).toContain("+class NoBase {}");
    await db.close();
  });

  it("검토 회차마다 따로 남기고, 회차 지정과 직전 회차 대비 변경을 돌려준다", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    const { app } = await createApp(db);
    const auth = await seedUserToken(db, "u1");
    const upload = (round: number | undefined, path: string, content: string) => request(app).post("/api/sync/review-artifact").set("Authorization", auth).send({
      workspaceName: "ws", taskId: "task-1", sessionId: "s1", patchVersion: 0, path, change: "modified", content, diff: `-base\n+${content}`, schemaVersion: 1, ...(round ? { round } : {}),
    }).expect(200);
    await upload(undefined, "src/A.ts", "const a = 1;\n");
    await upload(undefined, "src/B.ts", "const b = 1;\n");
    await upload(2, "src/A.ts", "const a = 2;\n");
    await upload(2, "src/B.ts", "const b = 1;\n");
    await upload(2, "src/C.ts", "const c = 1;\n");
    const read = (query: Record<string, string>) => request(app).get("/api/workspaces/ws/review-artifact").set("Authorization", auth)
      .query({ taskId: "task-1", sessionId: "s1", ...query }).expect(200).then((response) => response.body.artifact);

    expect(await read({ path: "src/A.ts" })).toMatchObject({ round: 2, content: "const a = 2;\n", diff: "-base\n+const a = 2;\n" });
    expect(await read({ path: "src/A.ts", round: "1" })).toMatchObject({ round: 1, content: "const a = 1;\n", diff: "-base\n+const a = 1;\n" });
    const compared = await read({ path: "src/A.ts", round: "2", compare: "previousRound" });
    expect(compared.diff).toContain("-const a = 1;");
    expect(compared.diff).toContain("+const a = 2;");
    expect(await read({ path: "src/B.ts", compare: "previousRound" })).toMatchObject({ changeType: "unchanged", diff: null, unavailableReason: "직전 회차 이후 이 파일은 바뀌지 않았습니다." });
    expect(await read({ path: "src/C.ts", compare: "previousRound" })).toMatchObject({ diff: "-base\n+const c = 1;\n", unavailableReason: expect.stringContaining("직전 회차에는") });
    await db.close();
  });

  it("회차 열이 없던 기존 테이블에도 열을 붙여 이어서 저장한다", async () => {
    const db = createSqliteClient();
    await db.execScript(schema.replace(" review_round INTEGER NOT NULL DEFAULT 1,", ""));
    await expect(db.query("SELECT review_round FROM sugo_review_artifacts LIMIT 1")).rejects.toThrow();
    await ensureReviewArtifactRoundColumn(db);
    const { app } = await createApp(db);
    const auth = await seedUserToken(db, "u1");
    await request(app).post("/api/sync/review-artifact").set("Authorization", auth).send({
      workspaceName: "ws", taskId: "task-1", sessionId: "s1", patchVersion: 0, round: 2, path: "src/A.ts", change: "added", content: "x", schemaVersion: 1,
    }).expect(200);
    const result = await request(app).get("/api/workspaces/ws/review-artifact").set("Authorization", auth).query({ taskId: "task-1", path: "src/A.ts", round: "2" }).expect(200);
    expect(result.body.artifact).toMatchObject({ round: 2, content: "x" });
    await db.close();
  });
});
