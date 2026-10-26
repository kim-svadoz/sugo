import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

async function freshApp() {
  const db = createSqliteClient();
  await db.execScript(schema);
  const settings = { enabled: true, weekday: 6, hour: 8, minute: 0, model: "opus" as const, extraRepositories: [], configured: true, tokenConfigured: false, engineAvailable: true };
  const weeklySettingsService = {
    get: async () => settings,
    save: async (value: typeof settings, token?: string) => ({ ...value, configured: true, tokenConfigured: Boolean(token), engineAvailable: true }),
    deleteToken: async () => undefined,
  };
  const { app } = await createApp({ db, weeklySettingsService });
  return { app, db, mine: await seedUserToken(db, "me"), other: await seedUserToken(db, "other") };
}

const body = (headline: string[]) => ({
  start: "2026-10-05",
  end: "2026-10-11",
  generatedAt: "2026-10-16T01:24:00",
  report: { headline, topics: [{ title: "로그인 개선" }] },
});

describe("/api/weekly/reports", () => {
  it("플러그인 토큰으로 올린 보고서를 목록과 본문으로 읽는다", async () => {
    const { app, mine } = await freshApp();
    await request(app).put("/api/weekly/reports/2026-W41").set("Authorization", mine).send(body(["한 줄 요약"])).expect(200);

    const list = await request(app).get("/api/weekly/reports").set("Authorization", mine).expect(200);
    expect(list.body.reports).toEqual([
      { weekId: "2026-W41", start: "2026-10-05", end: "2026-10-11", generatedAt: "2026-10-16T01:24:00", headline: ["한 줄 요약"], counts: { topics: 1, learnings: 0, blocked: 0, nextWeek: 0 } },
    ]);
    const one = await request(app).get("/api/weekly/reports/2026-W41").set("Authorization", mine).expect(200);
    expect(one.body.report.topics[0].title).toBe("로그인 개선");
  });

  it("같은 주를 다시 올리면 덮어쓰고 목록은 최신 주부터다", async () => {
    const { app, mine } = await freshApp();
    await request(app).put("/api/weekly/reports/2026-W40").set("Authorization", mine).send(body(["a"])).expect(200);
    await request(app).put("/api/weekly/reports/2026-W41").set("Authorization", mine).send(body(["old"])).expect(200);
    await request(app).put("/api/weekly/reports/2026-W41").set("Authorization", mine).send(body(["new"])).expect(200);

    const list = await request(app).get("/api/weekly/reports").set("Authorization", mine);
    expect(list.body.reports.map((r: { weekId: string; headline: string[] }) => [r.weekId, r.headline[0]])).toEqual([
      ["2026-W41", "new"],
      ["2026-W40", "a"],
    ]);
  });

  it("보고서는 올린 본인에게만 보인다", async () => {
    const { app, mine, other } = await freshApp();
    await request(app).put("/api/weekly/reports/2026-W41").set("Authorization", mine).send(body(["비공개"])).expect(200);

    expect((await request(app).get("/api/weekly/reports").set("Authorization", other)).body.reports).toEqual([]);
    await request(app).get("/api/weekly/reports/2026-W41").set("Authorization", other).expect(404);
  });

  it("토큰이 없으면 거부하고 잘못된 주 ID와 본문은 400이다", async () => {
    const { app, mine } = await freshApp();
    await request(app).get("/api/weekly/reports").expect(401);
    await request(app).put("/api/weekly/reports/W41").set("Authorization", mine).send(body([])).expect(400);
    await request(app).put("/api/weekly/reports/2026-W41").set("Authorization", mine).send({ report: {} }).expect(400);
  });

  it("보고서가 없으면 빈 목록이다", async () => {
    const { app, mine } = await freshApp();
    expect((await request(app).get("/api/weekly/reports").set("Authorization", mine)).body).toEqual({ reports: [] });
  });

  it("주간 설정은 토·일과 모델을 받고 토큰을 응답에 노출하지 않는다", async () => {
    const { app, mine } = await freshApp();
    const current = await request(app).get("/api/weekly/reports/settings/current").set("Authorization", mine).expect(200);
    expect(current.body.weekday).toBe(6);

    const saved = await request(app).put("/api/weekly/reports/settings/current").set("Authorization", mine).send({ enabled: true, weekday: 0, hour: 9, minute: 30, model: "sonnet", extraRepositories: [], token: "hidden" }).expect(200);
    expect(saved.body).toMatchObject({ weekday: 0, model: "sonnet", tokenConfigured: true });
    expect(saved.body).not.toHaveProperty("token");
  });
});
