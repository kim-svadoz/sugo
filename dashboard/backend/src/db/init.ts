import { ensureHumanCompletionTable } from "../services/humanCompletion.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { DbClient } from "./client.js";
import { createMySqlClient } from "./mysqlClient.js";
import { createSqliteClient } from "./sqliteClient.js";
import { migrateCanvasToRoadmap, migrateRoadmapRuntimeAssessment } from "./migrations.js";
import { migrateWstToRun } from "../services/workspaceService.js";
import {
  ensureCheckpointCreatedAtColumn,
  ensureCheckpointExpiresAtColumn,
  ensureRoadmapDueDateColumn,
  ensureRoadmapManualTitleColumn,
  ensureRoadmapBlockerDecisionColumns,
  ensureRoadmapProjectPathColumn,
  ensureRoadmapWorkBranchColumn,
} from "../services/syncService.js";
import { config } from "../config.js";
import { pruneExpiredActivityEvents } from "../services/activityService.js";
import { ensureGitConnectionProfileColumn } from "../services/gitConnectionService.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface InitDbOptions {
  /** 번들에는 test/ 디렉터리가 없으므로 번들러가 SQLite 스키마 텍스트를 직접 넘긴다. */
  sqliteSchema?: string;
}

export async function initDb(options: InitDbOptions = {}): Promise<DbClient> {
  if (config.dbDriver === "sqlite") {
    const client = createSqliteClient(config.sqliteFile);
    // 리네임은 CREATE TABLE IF NOT EXISTS보다 **먼저** — 새 이름 테이블이 먼저 생기면
    // 구 테이블 데이터가 고아가 된다(migrations.ts 주석 참고).
    await migrateCanvasToRoadmap(client);
    const schemaPath = join(__dirname, "..", "..", "test", "schema.sqlite.sql");
    await client.execScript(options.sqliteSchema ?? readFileSync(schemaPath, "utf8"));
    await migrateWstToRun(client);
    await ensureHumanCompletionTable(client);
    await migrateRoadmapRuntimeAssessment(client);
    await ensureRoadmapDueDateColumn(client);
    await ensureRoadmapProjectPathColumn(client);
    await ensureRoadmapWorkBranchColumn(client);
    await ensureRoadmapManualTitleColumn(client);
    await ensureRoadmapBlockerDecisionColumns(client);
    await ensureCheckpointCreatedAtColumn(client);
    await ensureCheckpointExpiresAtColumn(client);
    await ensureGitConnectionProfileColumn(client);
    await pruneExpiredActivityEvents(client);
    return client;
  }
  const client = createMySqlClient(config.mysql);
  await migrateCanvasToRoadmap(client);
  const schemaPath = join(__dirname, "schema.mysql.sql");
  await client.execScript(readFileSync(schemaPath, "utf8"));
  // 구 `wst-` 접두어 → `run-`. 테이블이 있어야 하므로 스키마 적용 뒤에 돈다.
  await migrateWstToRun(client);
    await ensureHumanCompletionTable(client);
  await migrateRoadmapRuntimeAssessment(client);
  // `due_date` 자가보강 — 스키마 파일의 CREATE TABLE IF NOT EXISTS는 이미 존재하는
  // 테이블에는 컬럼을 못 붙이므로, 업그레이드 배포를 위해 별도로 돈다.
  await ensureRoadmapDueDateColumn(client);
  await ensureRoadmapProjectPathColumn(client);
  await ensureRoadmapWorkBranchColumn(client);
  await ensureRoadmapManualTitleColumn(client);
  await ensureRoadmapBlockerDecisionColumns(client);
  await ensureCheckpointCreatedAtColumn(client);
  await ensureCheckpointExpiresAtColumn(client);
  await ensureGitConnectionProfileColumn(client);
  await pruneExpiredActivityEvents(client);
  return client;
}
