import { readFileSync } from "node:fs";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { findTaskProject } from "../src/services/taskProjectService.js";
import { seedUserToken } from "./testAuth.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

async function projects() {
  const root = await mkdtemp(join(tmpdir(), "sugo-task-project-"));
  const serving = join(root, "shop-api");
  const flow = join(root, "batch-config");
  await mkdir(join(serving, "sugo", "features", "20260921", "search-filter"), { recursive: true });
  await mkdir(join(flow, "sugo", "features", "config-cache"), { recursive: true });
  return { root, serving, flow };
}

describe("작업이 속한 프로젝트 찾기", () => {
  it("예전 기록에 프로젝트가 없어도 그 작업의 feature 폴더가 있는 프로젝트를 찾는다", async () => {
    const { serving, flow } = await projects();
    expect(await findTaskProject([flow, serving], "search-filter")).toBe(serving);
    expect(await findTaskProject([flow, serving], "config-cache")).toBe(flow);
  });

  it("어느 프로젝트에도 폴더가 없거나 이름이 경로 형태면 찾지 않는다", async () => {
    const { serving, flow, root } = await projects();
    expect(await findTaskProject([flow, serving], "missing-task")).toBeNull();
    for (const name of ["..", ".", "../shop-api", "20260921/search-filter", ""]) {
      expect(await findTaskProject([flow, serving, root], name)).toBeNull();
    }
  });

  it("API는 내 도메인에 등록된 프로젝트에서만 찾는다", async () => {
    const { serving, flow } = await projects();
    const db = createSqliteClient();
    await db.execScript(schema);
    const { app } = await createApp(db);
    const mine = await seedUserToken(db, "u1");
    const other = await seedUserToken(db, "u2");
    await request(app).post("/api/sync/workspace").set("Authorization", mine).send({ userId: "u1", name: "shop", projects: [flow, serving] }).expect(200);

    const found = await request(app).get("/api/workspaces/shop/task-projects").query({ tasks: "search-filter,missing-task" }).set("Authorization", mine).expect(200);
    expect(found.body).toEqual({ projects: { "search-filter": serving } });

    const blocked = await request(app).get("/api/workspaces/shop/task-projects").query({ tasks: "search-filter" }).set("Authorization", other).expect(200);
    expect(blocked.body).toEqual({ projects: {} });
  });
});
