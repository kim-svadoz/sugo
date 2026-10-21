/**
 * 번들 실행 진입점: 한 프로세스·한 포트에서 UI와 API를 제공한다.
 * DB, 세션 비밀, 로그, 실행 상태는 사용자 데이터 폴더(`~/.claude/sugo/dashboard`)에 둔다.
 *
 * config는 import 시점에 환경변수를 읽으므로, 환경을 채운 뒤에 앱을 동적 import한다.
 */
import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sqliteSchema from "../test/schema.sqlite.sql";

const DEFAULT_PORT = 3001;
const HOST = "127.0.0.1";

const sugoHome = process.env.SUGO_HOME_OVERRIDE ?? homedir();
const sugoDir = join(sugoHome, ".claude", "sugo");
const dataDir = join(sugoDir, "dashboard");
const secretFile = join(dataDir, "session-secret");
const stateFile = join(dataDir, "server.json");
const port = Number(process.env.SUGO_DASHBOARD_PORT ?? DEFAULT_PORT);
const runtimeDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = dirname(runtimeDir);
const staticDir = process.env.DASHBOARD_STATIC_DIR ?? join(runtimeDir, "web");
const userId = process.env.LOCAL_DEV_USER_ID ?? userInfo().username;
const displayName = process.env.LOCAL_DEV_DISPLAY_NAME ?? userId;

async function loadOrCreateSecret(): Promise<string> {
  try {
    return (await readFile(secretFile, "utf8")).trim();
  } catch {
    // 첫 실행: 비밀이 아직 없다.
  }
  const secret = randomBytes(32).toString("base64");
  await writeFile(secretFile, secret, { mode: 0o600 });
  await chmod(secretFile, 0o600);
  return secret;
}

process.on("unhandledRejection", (reason) => {
  console.error("[dashboard] unhandledRejection (프로세스 유지):", reason instanceof Error ? reason.message : reason);
});
process.on("uncaughtException", (err) => {
  console.error("[dashboard] uncaughtException (프로세스 유지):", err.message);
});

await mkdir(dataDir, { recursive: true });
const sessionSecret = await loadOrCreateSecret();
const apiUrl = `http://localhost:${port}`;

process.env.SUGO_DASHBOARD_EMBEDDED = "1";
process.env.HOST = HOST;
process.env.PORT = String(port);
process.env.DB_DRIVER = "sqlite";
process.env.SQLITE_FILE = join(dataDir, "dashboard.db");
process.env.SESSION_SECRET = sessionSecret;
process.env.LOCAL_DEV_MODE = "1";
process.env.LOCAL_DEV_USER_ID = userId;
process.env.LOCAL_DEV_DISPLAY_NAME = displayName;
process.env.FRONTEND_URL = apiUrl;
process.env.CORS_ORIGINS = apiUrl;
process.env.SUGO_DASHBOARD_API_URL = apiUrl;
process.env.HARNESS_PATH = join(pluginRoot, "harness-library");
process.env.SKILLS_PATH = pluginRoot;

const { createApp } = await import("./index.js");
const { bootstrapLocalDashboard } = await import("./localBootstrap.js");

const { app, db, awsContextClient, pinpointClient } = await createApp({ staticDir, sqliteSchema });
const { startContextAutoRefresh } = await import("./services/contextAutoRefreshService.js");
await bootstrapLocalDashboard(db, {
  userId,
  displayName,
  apiUrl,
  settingsPath: join(sugoDir, "settings.json"),
});
const stopContextAutoRefresh = startContextAutoRefresh(db, awsContextClient, pinpointClient);

const server = app.listen(port, HOST, () => {
  void writeFile(stateFile, `${JSON.stringify({ pid: process.pid, port, version: process.env.DASHBOARD_VERSION, startedAt: new Date().toISOString() })}\n`);
  console.log(`Dashboard → ${apiUrl}`);
});
server.on("error", (err) => {
  console.error(`[dashboard] 서버 시작 실패: ${err.message}`);
  process.exit(1);
});

async function shutdown() {
  stopContextAutoRefresh();
  server.close();
  await db.close();
  await rm(stateFile, { force: true });
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
