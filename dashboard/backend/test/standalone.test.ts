import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { config } from "../src/config.js";
import { createApp } from "../src/index.js";
import { initDb } from "../src/db/init.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { bootstrapLocalDashboard } from "../src/localBootstrap.js";
import { resolveUserIdByToken } from "../src/services/apiTokenService.js";
import type { DbClient } from "../src/db/client.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");
let dir: string;
let db: DbClient;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "sugo-standalone-"));
  db = createSqliteClient();
  await db.execScript(schema);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("한 포트에서 UI와 API 제공", () => {
  it("API가 아닌 GET은 index.html로 돌려줘 SPA 새로고침이 동작한다", async () => {
    writeFileSync(join(dir, "index.html"), "<html>ui</html>");
    const { app } = await createApp({ db, staticDir: dir });

    const res = await request(app).get("/sessions");
    expect(res.status).toBe(200);
    expect(res.text).toContain("ui");
  });

  it("API 경로와 health는 index.html로 가려지지 않는다", async () => {
    writeFileSync(join(dir, "index.html"), "<html>ui</html>");
    const { app } = await createApp({ db, staticDir: dir });

    expect((await request(app).get("/health")).body.status).toBe("ok");
    const unknownApi = await request(app).get("/api/does-not-exist");
    expect(unknownApi.text).not.toContain("ui");
  });

  it("화면 주소가 비어 있으면 로그인 뒤 상대 경로로 돌아가 사용자가 연 이름(sugo.localhost)에 머문다", async () => {
    const { app } = await createApp({ db, sessionSecret: "s".repeat(32), frontendUrl: "", localDev: { enabled: true, userId: "me", displayName: "Me" } });

    const res = await request(app).get("/api/auth/local").set("Host", "sugo.localhost:3002");
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/auth\/callback#session=/);
  });

  it("staticDir이 없으면 UI를 서빙하지 않는다", async () => {
    const { app } = await createApp({ db });
    expect((await request(app).get("/sessions")).status).toBe(404);
  });
});

describe("initDb에 스키마 텍스트를 직접 넘기는 번들 경로", () => {
  it("파일을 읽지 않고 넘긴 스키마로 테이블을 만든다", async () => {
    const previous = { driver: config.dbDriver, file: config.sqliteFile };
    config.dbDriver = "sqlite";
    config.sqliteFile = ":memory:";
    try {
      const fresh = await initDb({ sqliteSchema: schema });
      expect(await fresh.query("SELECT 1 FROM sugo_users LIMIT 1")).toEqual([]);
      await fresh.close();
    } finally {
      config.dbDriver = previous.driver;
      config.sqliteFile = previous.file;
    }
  });
});

describe("로컬 연결 부트스트랩", () => {
  const input = () => ({ userId: "me", displayName: "Me", apiUrl: "http://localhost:3001", settingsPath: join(dir, "sugo", "settings.json") });
  const readSettings = () => JSON.parse(readFileSync(input().settingsPath, "utf8"));

  it("첫 실행에 사용자·토큰을 만들고 dashboard 연결을 켠다", async () => {
    const result = await bootstrapLocalDashboard(db, input());

    expect(result.tokenReused).toBe(false);
    const { dashboard } = readSettings();
    expect(dashboard).toMatchObject({ enabled: true, apiUrl: "http://localhost:3001", userId: "me" });
    expect(await resolveUserIdByToken(db, dashboard.apiToken)).toBe("me");
  });

  it("다시 실행하면 같은 토큰을 재사용한다", async () => {
    await bootstrapLocalDashboard(db, input());
    const first = readSettings().dashboard.apiToken;

    const result = await bootstrapLocalDashboard(db, input());

    expect(result.tokenReused).toBe(true);
    expect(readSettings().dashboard.apiToken).toBe(first);
  });

  it("사용자가 정한 닉네임은 Console 재시작 때 OS 이름으로 덮어쓰지 않는다", async () => {
    await bootstrapLocalDashboard(db, input());
    await db.exec("UPDATE sugo_users SET display_name = ? WHERE id = ?", ["내 닉네임", "me"]);
    await bootstrapLocalDashboard(db, { ...input(), displayName: "OS Account" });
    expect(await db.query("SELECT display_name FROM sugo_users WHERE id = ?", ["me"])).toEqual([{ display_name: "내 닉네임" }]);
  });

  it("DB에서 무효한 토큰은 새로 발급하고 다른 설정 키는 보존한다", async () => {
    const settingsPath = input().settingsPath;
    await bootstrapLocalDashboard(db, input());
    const stale = { ...readSettings(), language: "ko", dashboard: { ...readSettings().dashboard, apiToken: "stale-token" } };
    writeFileSync(settingsPath, JSON.stringify(stale));

    const result = await bootstrapLocalDashboard(db, input());

    expect(result.tokenReused).toBe(false);
    const next = readSettings();
    expect(next.language).toBe("ko");
    expect(next.dashboard.apiToken).not.toBe("stale-token");
  });
});
