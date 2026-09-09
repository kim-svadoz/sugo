export interface ExecResult {
  insertId: number | string | null;
  affectedRows: number;
}

// Minimal DB-agnostic surface. MySqlClient (production) and SqliteClient
// (local dev/test stand-in) both implement
// this so route/service code never depends on which driver is behind it.
export interface DbClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  exec(sql: string, params?: unknown[]): Promise<ExecResult>;
  execScript(sqlText: string): Promise<void>;
  close(): Promise<void>;
}

export function splitStatements(sqlText: string): string[] {
  const withoutComments = sqlText
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return withoutComments
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
