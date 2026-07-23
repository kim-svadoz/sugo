import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DbClient } from "./client.js";
import { createMySqlClient } from "./mysqlClient.js";
import { createSqliteClient } from "./sqliteClient.js";
import { config } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function initDb(): Promise<DbClient> {
  if (config.dbDriver === "sqlite") {
    const client = createSqliteClient(config.sqliteFile);
    const schemaPath = join(__dirname, "..", "..", "test", "schema.sqlite.sql");
    await client.execScript(readFileSync(schemaPath, "utf8"));
    return client;
  }
  const client = createMySqlClient(config.mysql);
  const schemaPath = join(__dirname, "schema.mysql.sql");
  await client.execScript(readFileSync(schemaPath, "utf8"));
  return client;
}
