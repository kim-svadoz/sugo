import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createSqliteClient } from "../src/db/sqliteClient.js";
import { upsertRow } from "../src/db/upsert.js";

const schema = readFileSync(join(__dirname, "schema.sqlite.sql"), "utf8");

describe("upsertRow", () => {
  it("inserts when the key doesn't exist yet", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    await upsertRow(db, "sugo_users", { id: "u1" }, { display_name: "Kim" });
    const rows = await db.query<{ id: string; display_name: string }>(
      "SELECT id, display_name FROM sugo_users WHERE id = ?",
      ["u1"]
    );
    expect(rows).toEqual([{ id: "u1", display_name: "Kim" }]);
    await db.close();
  });

  it("updates in place when the key already exists", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    await upsertRow(db, "sugo_users", { id: "u1" }, { display_name: "Kim" });
    await upsertRow(db, "sugo_users", { id: "u1" }, { display_name: "Kim2" });
    const rows = await db.query<{ display_name: string }>(
      "SELECT display_name FROM sugo_users WHERE id = ?",
      ["u1"]
    );
    expect(rows).toEqual([{ display_name: "Kim2" }]);
    await db.close();
  });

  it("no-ops (does not throw) when dataColumns is empty and row already exists", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    await upsertRow(db, "sugo_users", { id: "u1" }, {});
    await expect(upsertRow(db, "sugo_users", { id: "u1" }, {})).resolves.toBeUndefined();
    await db.close();
  });

  it("still inserts a bare key row when dataColumns is empty and row is new", async () => {
    const db = createSqliteClient();
    await db.execScript(schema);
    await upsertRow(db, "sugo_users", { id: "u1" }, {});
    const rows = await db.query("SELECT id FROM sugo_users WHERE id = ?", ["u1"]);
    expect(rows).toEqual([{ id: "u1" }]);
    await db.close();
  });
});
