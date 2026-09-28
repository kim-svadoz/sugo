import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

async function freshApp() {
  const db = createSqliteClient();
  await db.execScript(schema);
  return createApp(db);
}

describe("CORS whitelist (§8 fix for the original's wide-open cors())", () => {
  it("allows the whitelisted dev origin", async () => {
    const { app } = await freshApp();
    const res = await request(app).get("/health").set("Origin", "http://localhost:5175");
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5175");
  });

  it("does not reflect an arbitrary non-whitelisted origin", async () => {
    const { app } = await freshApp();
    const res = await request(app).get("/health").set("Origin", "https://evil.example.com");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("responds 204 to an OPTIONS preflight", async () => {
    const { app } = await freshApp();
    const res = await request(app).options("/api/workspaces").set("Origin", "http://localhost:5175");
    expect(res.status).toBe(204);
  });
});
