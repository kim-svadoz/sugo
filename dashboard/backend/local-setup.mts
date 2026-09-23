/**
 * 개인용 SQLite Dashboard 초기화.
 *
 * - local user를 보장한다.
 * - 기존 settings의 API token이 DB에서 유효하면 재사용한다.
 * - 없거나 무효면 새 token을 한 번 발급한다.
 * - ~/.claude/sugo/settings.json의 dashboard 연결만 안전하게 병합한다.
 */
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { initDb } from "./src/db/init.js";
import { createApiToken, resolveUserIdByToken } from "./src/services/apiTokenService.js";
import { syncUser } from "./src/services/syncService.js";

const userId = process.env.LOCAL_DEV_USER_ID ?? "local-dev";
const displayName = process.env.LOCAL_DEV_DISPLAY_NAME ?? "Local Developer";
const apiUrl = process.env.SUGO_DASHBOARD_API_URL ?? "http://localhost:3001";
const sugoHome = process.env.SUGO_HOME_OVERRIDE ?? homedir();
const settingsPath = process.env.SUGO_SETTINGS_FILE ?? join(sugoHome, ".claude", "sugo", "settings.json");

async function readSettings(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

const db = await initDb();
try {
  await syncUser(db, { userId, displayName });
  const settings = await readSettings();
  const dashboard = (settings.dashboard ?? {}) as Record<string, unknown>;
  const existingToken = typeof dashboard.apiToken === "string" ? dashboard.apiToken : undefined;
  const existingOwner = existingToken ? await resolveUserIdByToken(db, existingToken) : null;
  const apiToken = existingOwner === userId ? existingToken! : (await createApiToken(db, userId, "local-dashboard")).token;

  const next = {
    ...settings,
    dashboard: { ...dashboard, enabled: true, apiUrl, userId, apiToken },
  };
  await mkdir(dirname(settingsPath), { recursive: true });
  const tempPath = `${settingsPath}.tmp-${process.pid}`;
  await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await rename(tempPath, settingsPath);
  await chmod(settingsPath, 0o600);

  console.log(`[local-setup] user=${userId}`);
  console.log(`[local-setup] database=${process.env.SQLITE_FILE ?? "./local.db"}`);
  console.log(`[local-setup] Sugo Agent 연결 저장=${settingsPath}`);
  console.log(`[local-setup] API token=${existingOwner === userId ? "reused" : "created"} (값은 출력하지 않음)`);
} finally {
  await db.close();
}
