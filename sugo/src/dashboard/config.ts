import { userInfo } from "node:os";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sugoHomeDir } from "../homeDir.js";

/**
 * Discriminated union: enabled일 때는 apiUrl/userId가 반드시 있다(resolveDashboardConfig가
 * currentUsername 폴백으로 userId를 항상 채운다). 이렇게 좁혀두면 `if (!config.enabled) return`
 * 뒤에서 TS가 userId를 string으로 인지해 seam 직렬화(serialize.ts)에 그대로 넘길 수 있다.
 */
export type DashboardConfig = { enabled: false } | { enabled: true; apiUrl: string; userId: string };

function settingsFilePath(): string {
  return join(sugoHomeDir(), ".claude", "sugo", "settings.json");
}

function currentUsername(): string {
  try {
    return userInfo().username;
  } catch {
    return "unknown";
  }
}

/**
 * §7.2 대시보드 설정 해석: `SUGO_DASHBOARD_API_URL`/`SUGO_DASHBOARD_USER_ID` env가 있으면 최우선
 * (정리 대상 — 외부에서 지정). 없으면 `~/.claude/sugo/settings.json`의 `dashboard{apiUrl,userId,
 * enabled}`를 본다. 둘 다 없거나 enabled가 명시적으로 false면 disabled — 이 함수를 호출하는 쪽은
 * enabled를 확인하고 나서만 실제 네트워크 호출을 시도해야 한다(§7.2 "대시보드 다운이 파이프라인을
 * 막지 않는다"는 원칙의 첫 관문).
 */
export async function resolveDashboardConfig(): Promise<DashboardConfig> {
  const envUrl = process.env.SUGO_DASHBOARD_API_URL;
  if (envUrl) {
    return { enabled: true, apiUrl: envUrl, userId: process.env.SUGO_DASHBOARD_USER_ID ?? currentUsername() };
  }

  try {
    const raw = await readFile(settingsFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as { dashboard?: { apiUrl?: string; userId?: string; enabled?: boolean } };
    const d = parsed.dashboard;
    if (d?.enabled && d.apiUrl) {
      return { enabled: true, apiUrl: d.apiUrl, userId: d.userId ?? currentUsername() };
    }
  } catch {
    // 설정 파일이 없거나 파싱 실패 — disabled로 폴백(차단 아님)
  }

  return { enabled: false };
}
