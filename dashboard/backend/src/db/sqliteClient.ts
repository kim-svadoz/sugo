import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { DbClient, ExecResult } from "./client.js";
import { splitStatements } from "./client.js";

// Loaded via createRequire (not a static import) because Vite/Vitest's SSR
// resolver mishandles the "node:sqlite" specifier (still-experimental
// built-in, not in Vite's built-in module list) and fails to resolve it.
// createRequire bypasses Vite's import analysis entirely.
const { DatabaseSync } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: typeof DatabaseSyncType;
};

// Local dev/test stand-in for MySQL until a real instance is available
// (see docs/roadmap-progress.md). Uses Node's built-in node:sqlite (Node
// 22.5+, still experimental) instead of better-sqlite3 — this environment
// has no working Python/node-gyp toolchain to compile better-sqlite3's
// native binding, and node:sqlite needs no native compile at all.
// Same DbClient surface as mysqlClient.ts — route/service code is written
// once against the interface.
export function createSqliteClient(filename = ":memory:"): DbClient {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON");

  return {
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      return db.prepare(sql).all(...(params as never[])) as T[];
    },
    async exec(sql: string, params: unknown[] = []): Promise<ExecResult> {
      const info = db.prepare(sql).run(...(params as never[]));
      const insertId =
        typeof info.lastInsertRowid === "bigint" ? Number(info.lastInsertRowid) : info.lastInsertRowid ?? null;
      return { insertId, affectedRows: Number(info.changes) };
    },
    async execScript(sqlText: string): Promise<void> {
      for (const statement of splitStatements(sqlText)) {
        db.exec(statement);
      }
    },
    async close(): Promise<void> {
      db.close();
    },
  };
}
