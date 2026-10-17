import { readFileSync } from "node:fs";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { createApp } from "../src/index.js";
import { seedUserToken } from "./testAuth.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

async function seedProject(db: ReturnType<typeof createSqliteClient>, userId: string, workspace: string, projectPath: string) {
  const authorization = await seedUserToken(db, userId);
  const inserted = await db.exec("INSERT INTO sugo_workspaces (user_id, name) VALUES (?, ?)", [userId, workspace]);
  await db.exec("INSERT INTO sugo_workspace_projects (workspace_id, project_path) VALUES (?, ?)", [inserted.insertId, projectPath]);
  return authorization;
}

describe("/api/project-integrations", () => {
  it("offers saved ECS candidates and persists an explicit project mapping", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    const authorization = await seedProject(db, "u1", "recommendation", "/work/orders-api");
    await db.exec("INSERT INTO user_aws_context_accounts (user_id, name, profile, region, account_id, principal_arn, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", ["u1", "team-dev", "dev", "ap-northeast-2", "123", "arn:test", "2026-09-30T00:00:00Z"]);
    await db.exec("INSERT INTO user_aws_context_snapshots (user_id, account_name, payload, observed_at) VALUES (?, ?, ?, ?)", ["u1", "team-dev", JSON.stringify([{ service: "ecs", resources: [{ service: "ecs", kind: "service", id: "orders-api-service", metadata: { cluster: "orders", images: ["registry/orders-api:343"], pinpointApplicationName: "orders-api-dev" } }] }]), "2026-09-30T00:00:00Z"]);
    const { app } = await createApp({ db });

    const initial = await request(app).get("/api/project-integrations").set("Authorization", authorization).expect(200);
    expect(initial.body.projects).toEqual([expect.objectContaining({ workspace_name: "recommendation", configured: false })]);
    expect(initial.body.candidates).toEqual([expect.objectContaining({ accountName: "team-dev", environment: "dev", service: "orders-api-service", pinpointApplicationName: "orders-api-dev" })]);

    await request(app).put("/api/project-integrations").set("Authorization", authorization).send({ projectPath: "/work/orders-api", selections: [{ accountName: "team-dev", environment: "dev", service: "orders-api-service", cluster: "orders" }] }).expect(200);
    const configured = await request(app).get("/api/project-integrations").set("Authorization", authorization).expect(200);
    expect(configured.body.projects[0]).toMatchObject({ configured: true, selections: [{ accountName: "team-dev", environment: "dev", service: "orders-api-service", cluster: "orders" }] });
  });

  it("supports an explicit opt-out and prevents mapping another user's project", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    const authorization = await seedProject(db, "u1", "mine", "/work/mine");
    await seedProject(db, "u2", "theirs", "/work/theirs");
    const { app } = await createApp({ db });

    await request(app).put("/api/project-integrations").set("Authorization", authorization).send({ projectPath: "/work/mine", selections: [] }).expect(200);
    const result = await request(app).get("/api/project-integrations").set("Authorization", authorization).expect(200);
    expect(result.body.projects).toEqual([expect.objectContaining({ project_path: "/work/mine", configured: true, selections: [] })]);
    await request(app).put("/api/project-integrations").set("Authorization", authorization).send({ projectPath: "/work/theirs", selections: [] }).expect(404);
  });
});
