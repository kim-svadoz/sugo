import { userInfo } from "node:os";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sugoHomeDir } from "../homeDir.js";

/**
 * Discriminated union: enabled일 때는 apiUrl/userId가 반드시 있다(resolveDashboardConfig가
 * currentUsername 폴백으로 userId를 항상 채운다). 이렇게 좁혀두면 `if (!config.enabled) return`
 * 뒤에서 TS가 userId를 string으로 인지해 seam 직렬화(serialize.ts)에 그대로 넘길 수 있다.
 */
export type DashboardConfig =
  | { enabled: false }
  | { enabled: true; apiUrl: string; userId: string; apiToken?: string };

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
 * 대시보드 설정 해석: `SUGO_DASHBOARD_API_URL`/`SUGO_DASHBOARD_USER_ID` env가 있으면 최우선
 * 없으면 `~/.claude/sugo/settings.json`의 `dashboard{apiUrl,userId,
 * enabled}`를 본다. 둘 다 없거나 enabled가 명시적으로 false면 disabled — 이 함수를 호출하는 쪽은
 * enabled를 확인하고 나서만 실제 네트워크 호출을 시도해야 한다("대시보드 다운이 파이프라인을
 * 막지 않는다"는 원칙의 첫 관문).
 */
export async function resolveDashboardConfig(): Promise<DashboardConfig> {
  const envUrl = process.env.SUGO_DASHBOARD_API_URL;
  if (envUrl) {
    return {
      enabled: true,
      apiUrl: envUrl,
      userId: process.env.SUGO_DASHBOARD_USER_ID ?? currentUsername(),
      // 공개 SaaS 대시보드는 API 토큰이 필요하다(웹UI에서 발급→여기 붙여넣기). self-host/로컬은 생략 가능.
      apiToken: process.env.SUGO_DASHBOARD_API_TOKEN,
    };
  }

  try {
    const raw = await readFile(settingsFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as { dashboard?: { apiUrl?: string; userId?: string; apiToken?: string; enabled?: boolean } };
    const d = parsed.dashboard;
    if (d?.enabled && d.apiUrl) {
      return { enabled: true, apiUrl: d.apiUrl, userId: d.userId ?? currentUsername(), apiToken: d.apiToken };
    }
  } catch {
    // 설정 파일이 없거나 파싱 실패 — disabled로 폴백(차단 아님)
  }

  return { enabled: false };
}

/**
 * `sugo_aws_context`의 환경 이름을 Dashboard에 등록한 AWS 계정 표시 이름으로 바꾼다.
 * `settings.json`의 `aws.environments`(예: `{"dev": "my-dev-account"}`)에 사용자가 등록한 경우에만
 * 별칭을 적용하고, 없으면 환경 이름을 계정 표시 이름으로 그대로 쓴다.
 */
export async function resolveAwsEnvironmentAccount(environment: string): Promise<string> {
  try {
    const raw = await readFile(settingsFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as { aws?: { environments?: Record<string, unknown> } };
    const mapped = parsed.aws?.environments?.[environment];
    if (typeof mapped === "string" && mapped.trim()) return mapped.trim();
  } catch {
    // 설정 파일이 없거나 파싱 실패 — 별칭 없이 환경 이름을 그대로 쓴다
  }
  return environment;
}
