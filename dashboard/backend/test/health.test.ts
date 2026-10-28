import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

describe("GET /health", () => {
  it("reports status/service/version/build without touching a real MySQL instance", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    const { app } = await createApp(db);

    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    // service는 Sugo 플러그인이 같은 포트의 다른 앱과 Console을 구별하는 표시다.
    expect(res.body).toEqual({ status: "ok", service: "sugo-console", version: pkg.version, build: "dev" });
    // 꺼진 Console의 안내 페이지가 다른 포트의 Console을 찾을 때 읽는다.
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    await db.close();
  });
});
