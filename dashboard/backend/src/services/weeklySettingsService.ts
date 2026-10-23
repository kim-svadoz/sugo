import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

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

export interface WeeklySettingsServiceOptions {
  weeklyHome?: string;
  applySchedule?: (settings: WeeklySettings) => Promise<void>;
}

const defaults: WeeklySettings = {
  enabled: true,
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
  const weeklyHome = options.weeklyHome ?? join(homedir(), ".weekly");
  const configPath = join(weeklyHome, "config.json");
  const tokenPath = join(weeklyHome, "claude.token");
  const setupMarkerPath = join(weeklyHome, "setup-complete");
  const enginePath = join(weeklyHome, "app");

  const defaultApplySchedule = async (settings: WeeklySettings) => {
    if (!(await exists(enginePath))) throw new Error("weekly_engine_unavailable");
    const args = settings.enabled
      ? ["-m", "weekly_report.install", "on", "--weekday", String(settings.weekday), "--time", `${String(settings.hour).padStart(2, "0")}:${String(settings.minute).padStart(2, "0")}`, "--model", settings.model === "default" ? "" : settings.model]
      : ["-m", "weekly_report.install", "off"];
    await execFileAsync("python3", args, { cwd: enginePath, timeout: 30_000 });
  };
  const applySchedule = options.applySchedule ?? defaultApplySchedule;

  return {
    async get(): Promise<WeeklySettingsView> {
      const stored = await readStoredConfig(configPath);
      return {
        ...normalizeConfig(stored ?? {}),
        configured: stored !== null && await exists(setupMarkerPath),
        tokenConfigured: await exists(tokenPath),
        engineAvailable: await exists(enginePath),
      };
    },

    async save(settings: WeeklySettings, token?: string): Promise<WeeklySettingsView> {
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
      if (token?.trim()) {
        await writeFile(tokenPath, `${token.trim()}\n`, { encoding: "utf8", mode: 0o600 });
        await chmod(tokenPath, 0o600);
      }
      await writeFile(setupMarkerPath, "configured-by-sugo-console\n", { encoding: "utf8", mode: 0o600 });
      await applySchedule(settings);
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
