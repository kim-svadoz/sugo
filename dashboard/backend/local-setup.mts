/**
 * 개인용 SQLite Dashboard 초기화(개발 경로). 연결 설정 로직은 번들 서버와 같은 모듈을 쓴다.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { initDb } from "./src/db/init.js";
import { bootstrapLocalDashboard } from "./src/localBootstrap.js";

const userId = process.env.LOCAL_DEV_USER_ID ?? "local-dev";
const displayName = process.env.LOCAL_DEV_DISPLAY_NAME ?? "Local Developer";
const apiUrl = process.env.SUGO_DASHBOARD_API_URL ?? "http://localhost:3001";
const sugoHome = process.env.SUGO_HOME_OVERRIDE ?? homedir();
const settingsPath = process.env.SUGO_SETTINGS_FILE ?? join(sugoHome, ".claude", "sugo", "settings.json");

const db = await initDb();
try {
  const { tokenReused } = await bootstrapLocalDashboard(db, { userId, displayName, apiUrl, settingsPath });
  console.log(`[local-setup] user=${userId}`);
  console.log(`[local-setup] database=${process.env.SQLITE_FILE ?? "./local.db"}`);
  console.log(`[local-setup] Sugo Agent 연결 저장=${settingsPath}`);
  console.log(`[local-setup] API token=${tokenReused ? "reused" : "created"} (값은 출력하지 않음)`);
} finally {
  await db.close();
}
