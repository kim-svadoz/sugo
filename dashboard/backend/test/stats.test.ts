import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { computeCalibratedRatio } from "../src/services/statsService.js";
import { seedUserToken } from "./testAuth.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

describe("computeCalibratedRatio (§3.7 유일한 실측)", () => {
  it("반드시 지켜야: 표본 <10이면 null(실데이터 부족 — 가짜값 안 만듦)", () => {
    const rows = Array.from({ length: 9 }, () => ({ user_reported_human_hours: 3, ai_execution_minutes: 60 }));
    expect(computeCalibratedRatio(rows)).toBeNull();
  });

  it("표본 ≥10이면 관측비율(reported / ai_hours)의 중앙값을 반환한다", () => {
    // 모두 3시간 reported / 1시간(60분) ai = ratio 3.0
    const rows = Array.from({ length: 12 }, () => ({ user_reported_human_hours: 3, ai_execution_minutes: 60 }));
    expect(computeCalibratedRatio(rows)).toBe(3);
  });

  it("[1.0, 10.0]으로 클램프한다", () => {
    const tooHigh = Array.from({ length: 12 }, () => ({ user_reported_human_hours: 100, ai_execution_minutes: 60 }));
    expect(computeCalibratedRatio(tooHigh)).toBe(10);
    const tooLow = Array.from({ length: 12 }, () => ({ user_reported_human_hours: 0.1, ai_execution_minutes: 60 }));
    expect(computeCalibratedRatio(tooLow)).toBe(1);
  });

  it("reported/ai가 없거나 0인 행은 표본에서 제외한다", () => {
    const rows = [
      ...Array.from({ length: 10 }, () => ({ user_reported_human_hours: 2, ai_execution_minutes: 60 })),
      { user_reported_human_hours: null, ai_execution_minutes: 60 },
      { user_reported_human_hours: 5, ai_execution_minutes: null },
      { user_reported_human_hours: 0, ai_execution_minutes: 60 },
    ];
    expect(computeCalibratedRatio(rows)).toBe(2);
  });
});

describe("GET /api/metrics/calibrated-ratio (+ /api/stats alias)", () => {
  async function seeded(n: number) {
    const db = createSqliteClient();
    await db.execScript(schema);
    const auth = await seedUserToken(db, "u1");
    for (let i = 0; i < n; i++) {
      await db.exec(
        "INSERT INTO sugo_history (id, user_id, workspace_name, user_reported_human_hours, ai_execution_minutes) VALUES (?,?,?,?,?)",
        [`h${i}`, "u1", "ws1", 3, 60],
      );
    }
    const { app } = await createApp(db);
    return { app, auth };
  }

  it("실측 표본이 충분하면 ratio를 반환한다", async () => {
    const { app, auth } = await seeded(12);
    const res = await request(app).get("/api/metrics/calibrated-ratio").set("Authorization", auth).expect(200);
    expect(res.body.ratio).toBe(3);
  });

  it("표본 부족이면 ratio:null(플러그인이 고정 기본값으로 폴백)", async () => {
    const { app, auth } = await seeded(3);
    const res = await request(app).get("/api/stats/calibrated-ratio").set("Authorization", auth).expect(200);
    expect(res.body.ratio).toBeNull();
  });

  it("인증 없이 호출하면 401", async () => {
    const { app } = await seeded(12);
    await request(app).get("/api/metrics/calibrated-ratio").expect(401);
  });

  it("stub 통계는 0/빈값을 반환한다(가짜 데이터 금지)", async () => {
    const { app, auth } = await seeded(0);
    const usage = await request(app).get("/api/stats/usage").set("Authorization", auth).expect(200);
    expect(usage.body.totalSessions).toBe(0);
    const daily = await request(app).get("/api/metrics/daily").set("Authorization", auth).expect(200);
    expect(daily.body.days).toEqual([]);
  });
});

describe("§3.7 harness/skills — 미설정이면 빈 목록(404 아님)", () => {
  async function app() {
    const db = createSqliteClient();
    await db.execScript(schema);
    return (await createApp(db)).app;
  }
  it("harness manifest 빈 목록", async () => {
    const res = await request(await app()).get("/api/harness/manifest").expect(200);
    expect(res.body.harnesses).toEqual([]);
  });
  it("skills 빈 목록", async () => {
    const res = await request(await app()).get("/api/skills").expect(200);
    expect(res.body.skills).toEqual([]);
  });
  it("manifest 파일이 없어도 harness.md 트리에서 분류 목록을 파생한다", async () => {
    const root = mkdtempSync(join(tmpdir(), "sugo-harness-manifest-"));
    try {
      mkdirSync(join(root, "framework", "react", "19.x"), { recursive: true });
      writeFileSync(join(root, "framework", "react", "19.x", "harness.md"), "# React 19");
      const db = createSqliteClient();
      await db.execScript(schema);
      const { app } = await createApp({ db, harnessPath: root });
      const res = await request(app).get("/api/harness/manifest").expect(200);
      expect(res.body.harnesses).toEqual([{ id: "framework/react/19.x", name: "framework/react/19.x", version: "19.x" }]);
      const content = await request(app).get("/api/harness/content").query({ id: "framework/react/19.x" }).expect(200);
      expect(content.text).toBe("# React 19");
      await request(app).get("/api/harness/content").query({ id: "../outside" }).expect(400);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("§3.3 spec-content — decision을 slug로 매칭", () => {
  it("title로 decision content를 반환하고, 없으면 404", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    const auth = await seedUserToken(db, "u1");
    const { app } = await createApp(db);
    await request(app)
      .post("/api/sync/decision")
      .set("Authorization", auth)
      .send({ userId: "u1", workspaceName: "ws1", id: "인증", title: "인증 방식", content: "JWT 채택" })
      .expect(200);
    const hit = await request(app).get("/api/workspaces/ws1/spec-content").set("Authorization", auth).query({ title: "인증 방식" }).expect(200);
    expect(hit.body.content).toBe("JWT 채택");
    await request(app).get("/api/workspaces/ws1/spec-content").set("Authorization", auth).query({ title: "없는스펙" }).expect(404);
  });
});
