import request from "supertest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { seedUserToken } from "./testAuth.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

describe("profile", () => {
  const db = createSqliteClient();
  beforeEach(async () => { await db.execScript(schema); });

  it("로그인 사용자가 닉네임을 저장하고 다시 읽는다", async () => {
    const auth = await seedUserToken(db, "local-user");
    const { app } = await createApp({ db });
    await request(app).put("/api/profile").set("Authorization", auth).send({ displayName: "수고 사용자" }).expect(200);
    const response = await request(app).get("/api/profile").set("Authorization", auth).expect(200);
    expect(response.body).toEqual({ userId: "local-user", displayName: "수고 사용자" });
  });

  it("빈 닉네임은 저장하지 않는다", async () => {
    const auth = await seedUserToken(db, "local-user");
    const { app } = await createApp({ db });
    await request(app).put("/api/profile").set("Authorization", auth).send({ displayName: "  " }).expect(400);
  });
});
