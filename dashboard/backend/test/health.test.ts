import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

describe("GET /health", () => {
  it("reports status/version/build without touching a real MySQL instance", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    const { app } = await createApp(db);

    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", version: pkg.version, build: "dev" });
    await db.close();
  });
});
