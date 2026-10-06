import mysql from "mysql2/promise";
import type { DbClient, ExecResult } from "./client.js";
import { splitStatements } from "./client.js";

export interface MySqlConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

// Spec §2: TIMESTAMP stored as UTC, connection forced to timezone 'Z' so
// the driver never applies local-TZ conversion on read/write.
export function createMySqlClient(config: MySqlConfig): DbClient {
  const pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    timezone: "Z",
    waitForConnections: true,
    connectionLimit: 10,
  });

  return {
    dialect: "mysql",
    async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
      const [rows] = await pool.query(sql, params);
      return rows as T[];
    },
    async exec(sql: string, params: unknown[] = []): Promise<ExecResult> {
      const [result] = await pool.query(sql, params);
      const r = result as mysql.ResultSetHeader;
      return { insertId: r.insertId ?? null, affectedRows: r.affectedRows ?? 0 };
    },
    async execScript(sqlText: string): Promise<void> {
      for (const statement of splitStatements(sqlText)) {
        await pool.query(statement);
      }
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}
