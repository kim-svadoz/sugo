import type { DbClient } from "./client.js";

// Select-then-insert-or-update, not native ON CONFLICT/ON DUPLICATE KEY —
// deliberately, so the same code path works unchanged on both mysqlClient
// and sqliteClient (their upsert syntax differs) per the DbClient contract.
// table/column names here are always internal literals from callers, never
// request-supplied, so string-interpolating them into SQL is safe.
export async function upsertRow(
  db: DbClient,
  table: string,
  keyColumns: Record<string, unknown>,
  dataColumns: Record<string, unknown>
): Promise<void> {
  const keyNames = Object.keys(keyColumns);
  const whereClause = keyNames.map((k) => `${k} = ?`).join(" AND ");
  const whereParams = Object.values(keyColumns);

  const existing = await db.query(`SELECT 1 FROM ${table} WHERE ${whereClause}`, whereParams);
  const dataNames = Object.keys(dataColumns);

  if (existing.length > 0) {
    if (dataNames.length === 0) return; // nothing to update, row already there
    const setClause = dataNames.map((k) => `${k} = ?`).join(", ");
    await db.exec(`UPDATE ${table} SET ${setClause} WHERE ${whereClause}`, [
      ...Object.values(dataColumns),
      ...whereParams,
    ]);
    return;
  }

  const allColumns = { ...keyColumns, ...dataColumns };
  const columnNames = Object.keys(allColumns);
  const placeholders = columnNames.map(() => "?").join(", ");
  await db.exec(
    `INSERT INTO ${table} (${columnNames.join(", ")}) VALUES (${placeholders})`,
    Object.values(allColumns)
  );
}
