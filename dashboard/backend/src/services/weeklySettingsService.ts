import { execFile } from "node:child_process";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findWeeklyEngine, weeklyHomeDir } from "./weeklyScheduleService.js";

export type WeeklyModel = "default" | "sonnet" | "opus";

export interface WeeklySettings {
  enabled: boolean;
  weekday: number;
  hour: number;
  minute: number;
  model: WeeklyModel;
  extraRepositories: string[];
}

export interface WeeklySettingsView extends WeeklySettings {
  configured: boolean;
  tokenConfigured: boolean;
  engineAvailable: boolean;
}

interface StoredConfig {
  schedule?: { enabled?: boolean; weekday?: number; hour?: number; minute?: number };
  model?: string;
  git_repos?: unknown;
  [key: string]: unknown;
}

/** 예약 실행은 Console 타이머(weeklyScheduleService)가 config.json을 읽어 처리한다. 저장만 하면 다음 확인부터 적용된다. */
export interface WeeklySettingsServiceOptions {
  weeklyHome?: string;
  findEngine?: () => Promise<string | null>;
  /** 토큰으로 Claude에 로그인되는지 확인한다. 거부되면 이유를, 되거나 확인할 수 없으면 null을 돌려준다. */
  verifyToken?: (token: string) => Promise<string | null>;
}

const TOKEN_PATTERN = /^sk-ant-[A-Za-z0-9_-]+$/;

/**
 * 터미널은 긴 토큰을 여러 줄로 접어 보여 주고, 그대로 복사하면 접힌 자리에 줄바꿈·공백이 섞인다.
 * 토큰에는 공백이 없으므로 모두 지운 뒤 형식을 확인한다. 형식이 아니면 null.
 */
export function normalizeClaudeToken(raw: string): string | null {
  const token = raw.replace(/\s+/g, "");
  return TOKEN_PATTERN.test(token) ? token : null;
}

function tokenError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** 예약 실행과 같은 방식(`claude -p`, 도구·MCP·사용자 설정 없음)으로 한 번 불러 본다. claude가 없으면 확인을 건너뛴다. */
export function verifyClaudeToken(token: string): Promise<string | null> {
  const args = ["-p", "reply with OK", "--tools", "", "--strict-mcp-config", "--setting-sources", "", "--no-session-persistence", "--output-format", "json", "--model", "haiku"];
  return new Promise((resolve) => {
    const child = execFile("claude", args, { env: { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: token }, timeout: 60_000 }, (error, stdout, stderr) => {
      if ((error as NodeJS.ErrnoException | null)?.code === "ENOENT") { resolve(null); return; }
      let result: { is_error?: boolean; result?: unknown } | null = null;
      try { result = JSON.parse(stdout) as { is_error?: boolean; result?: unknown }; } catch { /* 아래에서 stderr로 이유를 만든다 */ }
      if (!error && result && !result.is_error) { resolve(null); return; }
      const reason = String(result?.result ?? (stderr.trim() || error?.message || "알 수 없는 오류"));
      resolve(reason.replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-***").slice(0, 300));
    });
    child.stdin?.end();
  });
}

const defaults: WeeklySettings = {
  enabled: false,
  weekday: 5,
  hour: 17,
  minute: 0,
  model: "default",
  extraRepositories: [],
};

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

function normalizeConfig(config: StoredConfig): WeeklySettings {
  const schedule = config.schedule ?? {};
  const model = config.model === "sonnet" || config.model === "opus" ? config.model : "default";
  return {
    enabled: typeof schedule.enabled === "boolean" ? schedule.enabled : defaults.enabled,
    weekday: Number.isInteger(schedule.weekday) ? Math.min(6, Math.max(0, schedule.weekday!)) : defaults.weekday,
    hour: Number.isInteger(schedule.hour) ? Math.min(23, Math.max(0, schedule.hour!)) : defaults.hour,
    minute: Number.isInteger(schedule.minute) ? Math.min(59, Math.max(0, schedule.minute!)) : defaults.minute,
    model,
    extraRepositories: Array.isArray(config.git_repos) ? config.git_repos.filter((value): value is string => typeof value === "string") : [],
  };
}

async function readStoredConfig(path: string): Promise<StoredConfig | null> {
  try { return JSON.parse(await readFile(path, "utf8")) as StoredConfig; } catch { return null; }
}

export function createWeeklySettingsService(options: WeeklySettingsServiceOptions = {}) {
  const findEngine = options.findEngine ?? (() => findWeeklyEngine());
  const verifyToken = options.verifyToken ?? verifyClaudeToken;
  const weeklyHome = options.weeklyHome ?? weeklyHomeDir();
  const configPath = join(weeklyHome, "config.json");
  const tokenPath = join(weeklyHome, "claude.token");
  const setupMarkerPath = join(weeklyHome, "setup-complete");


  return {
    async get(): Promise<WeeklySettingsView> {
      const stored = await readStoredConfig(configPath);
      return {
        ...normalizeConfig(stored ?? {}),
        configured: stored !== null && await exists(setupMarkerPath),
        tokenConfigured: await exists(tokenPath),
        engineAvailable: (await findEngine()) !== null,
      };
    },

    async save(settings: WeeklySettings, rawToken?: string): Promise<WeeklySettingsView> {
      let token: string | null = null;
      if (rawToken?.trim()) {
        token = normalizeClaudeToken(rawToken);
        if (!token) throw tokenError("INVALID_TOKEN", "Claude 토큰 형식이 아닙니다. claude setup-token이 출력한 sk-ant-로 시작하는 값을 붙여 넣으세요.");
        const rejected = await verifyToken(token);
        if (rejected) throw tokenError("TOKEN_REJECTED", `이 토큰으로 Claude에 로그인하지 못했습니다: ${rejected}`);
      }
      await mkdir(weeklyHome, { recursive: true });
      const previous = await readStoredConfig(configPath) ?? {};
      const next: StoredConfig = {
        ...previous,
        schedule: { enabled: settings.enabled, weekday: settings.weekday, hour: settings.hour, minute: settings.minute },
        git_repos: settings.extraRepositories,
      };
      if (settings.model === "default") delete next.model;
      else next.model = settings.model;
      await writeFile(configPath, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
      await chmod(configPath, 0o600);
      if (token) {
        await writeFile(tokenPath, `${token}\n`, { encoding: "utf8", mode: 0o600 });
        await chmod(tokenPath, 0o600);
      }
      await writeFile(setupMarkerPath, "configured-by-sugo-console\n", { encoding: "utf8", mode: 0o600 });
      return this.get();
    },

    async deleteToken(): Promise<void> {
      const { unlink } = await import("node:fs/promises");
      try { await unlink(tokenPath); } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}

export type WeeklySettingsService = ReturnType<typeof createWeeklySettingsService>;
