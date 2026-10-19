#!/usr/bin/env node
// 저장소 개발 경로(dev-local)의 SQLite DB를 번들 대시보드의 사용자 데이터 폴더로 옮긴다.
// 원본 DB는 읽기 전용으로만 열고(개발 서버가 쓰는 중이어도 일관된 스냅샷) 바꾸지 않는다.
// 사용: node import-legacy-dashboard-db.mjs <local.db 경로>
import { DatabaseSync } from "node:sqlite";
import { chmod, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const source = process.argv[2] ? resolve(process.argv[2]) : null;
if (!source) {
  console.error("Usage: node import-legacy-dashboard-db.mjs <path to local.db>");
  process.exit(2);
}
const home = process.env.SUGO_HOME_OVERRIDE ?? homedir();
const dataDir = join(home, ".claude", "sugo", "dashboard");
const target = join(dataDir, "dashboard.db");
const temp = `${target}.importing`;

const exists = (path) => stat(path).then(() => true, () => false);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

if (!(await exists(source))) { console.error(`Source database not found: ${source}`); process.exit(1); }
if (await exists(target)) { console.error(`Target already exists, not overwritten: ${target}`); process.exit(1); }
const state = await readFile(join(dataDir, "server.json"), "utf8").then(JSON.parse, () => null);
if (state && alive(state.pid)) { console.error(`The bundled dashboard is running (pid ${state.pid}). Stop it first so the new database is not created under a running server.`); process.exit(1); }

await mkdir(dataDir, { recursive: true });
await rm(temp, { force: true });
const db = new DatabaseSync(source, { readOnly: true });
try {
  db.exec(`VACUUM INTO '${temp.replaceAll("'", "''")}'`);
} finally {
  db.close();
}
await rename(temp, target);
await chmod(target, 0o600);

const copy = new DatabaseSync(target, { readOnly: true });
try {
  const tables = copy.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  for (const { name } of tables) {
    const row = copy.prepare(`SELECT COUNT(*) AS n FROM "${name.replaceAll('"', '""')}"`).get();
    console.log(`${name}: ${row.n}`);
  }
} finally {
  copy.close();
}
console.log(`Imported: ${source} -> ${target}`);
