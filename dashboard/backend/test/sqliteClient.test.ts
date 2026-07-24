import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSqliteClient } from "../src/db/sqliteClient.js";

const schemaPath = join(__dirname, "schema.sqlite.sql");
const schema = readFileSync(schemaPath, "utf8");

describe("sqliteClient — dev/test stand-in DbClient", () => {
  it("execScript creates every table declared in the schema", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);

    const rows = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    );
    const names = rows.map((r) => r.name);

    expect(names).toEqual(
      expect.arrayContaining([
        "sugo_users",
        "sugo_workspaces",
        "sugo_workspace_projects",
        "sugo_tasks",
        "sugo_history",
        "sugo_decisions",
        "sugo_checkpoints",
        "sugo_workspace_meta",
        "sugo_canvas_nodes",
        "sugo_activity_events",
        "user_bitbucket_tokens",
      ])
    );
    await db.close();
  });

  it("exec + query round-trips a row, insertId reflects AUTOINCREMENT", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);

    await db.exec("INSERT INTO sugo_users (id, display_name) VALUES (?, ?)", ["u1", "Kim"]);
    const rows = await db.query<{ id: string; display_name: string }>(
      "SELECT id, display_name FROM sugo_users WHERE id = ?",
      ["u1"]
    );
    expect(rows).toEqual([{ id: "u1", display_name: "Kim" }]);

    const inserted = await db.exec(
      "INSERT INTO sugo_workspaces (user_id, name) VALUES (?, ?)",
      ["u1", "ws1"]
    );
    expect(inserted.affectedRows).toBe(1);
    expect(inserted.insertId).toBeTypeOf("number");
    await db.close();
  });

  it("FK cascade delete removes dependent workspace_projects", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    await db.exec("INSERT INTO sugo_users (id) VALUES (?)", ["u1"]);
    const ws = await db.exec("INSERT INTO sugo_workspaces (user_id, name) VALUES (?, ?)", [
      "u1",
      "ws1",
    ]);
    await db.exec("INSERT INTO sugo_workspace_projects (workspace_id, project_path) VALUES (?, ?)", [
      ws.insertId,
      "C:/proj",
    ]);

    await db.exec("DELETE FROM sugo_workspaces WHERE id = ?", [ws.insertId]);
    const remaining = await db.query("SELECT * FROM sugo_workspace_projects");
    expect(remaining).toEqual([]);
    await db.close();
  });

  it("CHECK constraint rejects an invalid canvas level", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    await db.exec("INSERT INTO sugo_users (id) VALUES (?)", ["u1"]);

    await expect(
      db.exec(
        "INSERT INTO sugo_canvas_nodes (id, user_id, workspace_name, title, level) VALUES (?,?,?,?,?)",
        ["n1", "u1", "ws1", "T", "not-a-level"]
      )
    ).rejects.toThrow();
    await db.close();
  });
});
