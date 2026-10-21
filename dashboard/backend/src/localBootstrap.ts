/**
 * 개인용 로컬 Dashboard 연결 부트스트랩.
 *
 * - 로컬 사용자를 보장한다.
 * - settings의 API 토큰이 DB에서 유효하면 재사용하고, 없거나 무효면 새로 발급한다.
 * - `~/.claude/sugo/settings.json`의 dashboard 연결만 병합한다(다른 키는 보존).
 */
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { DbClient } from "./db/client.js";
import { createApiToken, resolveUserIdByToken } from "./services/apiTokenService.js";
import { ensureUser } from "./services/syncService.js";

export interface LocalBootstrapInput {
  userId: string;
  displayName: string;
  apiUrl: string;
  settingsPath: string;
}

export interface LocalBootstrapResult {
  tokenReused: boolean;
}

async function readSettings(settingsPath: string): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await readFile(settingsPath, "utf8")) as Record<string, unknown>;
  } catch {
    // 설정 파일이 없거나 깨졌으면 새로 만든다 — 첫 실행의 정상 경로다.
    return {};
  }
}

export async function bootstrapLocalDashboard(db: DbClient, input: LocalBootstrapInput): Promise<LocalBootstrapResult> {
  await ensureUser(db, input.userId);
  await db.exec("UPDATE sugo_users SET display_name = COALESCE(NULLIF(display_name, ''), ?) WHERE id = ?", [input.displayName, input.userId]);
  const settings = await readSettings(input.settingsPath);
  const dashboard = (settings.dashboard ?? {}) as Record<string, unknown>;
  const existingToken = typeof dashboard.apiToken === "string" ? dashboard.apiToken : undefined;
  const existingOwner = existingToken ? await resolveUserIdByToken(db, existingToken) : null;
  const tokenReused = existingOwner === input.userId;
  const apiToken = tokenReused ? existingToken! : (await createApiToken(db, input.userId, "local-dashboard")).token;

  const next = {
    ...settings,
    dashboard: { ...dashboard, enabled: true, apiUrl: input.apiUrl, userId: input.userId, apiToken },
  };
  await mkdir(dirname(input.settingsPath), { recursive: true });
  const tempPath = `${input.settingsPath}.tmp-${process.pid}`;
  await writeFile(tempPath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  await rename(tempPath, input.settingsPath);
  await chmod(input.settingsPath, 0o600);
  return { tokenReused };
}
