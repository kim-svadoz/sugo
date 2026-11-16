import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Weekly 데이터 폴더. 엔진(paths.py)과 같은 WEEKLY_HOME 규칙을 쓴다. */
export function weeklyHomeDir(): string {
  return process.env.WEEKLY_HOME ?? join(homedir(), ".weekly");
}

export interface WeeklySchedule { enabled: boolean; weekday: number; hour: number; minute: number }

/** 지금 이전의 가장 최근 예약 시점. 요일은 Date#getDay와 같다(0 = 일요일). Console이 도는 PC의 현지 시각을 쓴다. */
export function latestWeeklySlot(now: Date, schedule: Omit<WeeklySchedule, "enabled">): Date {
  const slot = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() - schedule.weekday + 7) % 7), schedule.hour, schedule.minute);
  if (slot > now) slot.setDate(slot.getDate() - 7);
  return slot;
}

/** handled 이후부터 now까지 지난 예약 시점. 오래된 것부터. */
export function weeklySlotsSince(handled: string, now: Date, schedule: Omit<WeeklySchedule, "enabled">): string[] {
  const slots: string[] = [];
  for (const slot = latestWeeklySlot(now, schedule); slot.toISOString() > handled; slot.setDate(slot.getDate() - 7)) slots.unshift(slot.toISOString());
  return slots;
}

/** 이 시각에 실행하면 엔진(collect.week_range)이 만드는 주. 금~일은 그 주, 월~목은 지난주다. */
export function weeklyLabelForRun(at: Date): string {
  const weekday = (at.getDay() + 6) % 7;
  const monday = new Date(Date.UTC(at.getFullYear(), at.getMonth(), at.getDate() - weekday - (weekday >= 4 ? 0 : 7)));
  const thursday = new Date(monday.getTime() + 3 * 86_400_000);
  const jan4 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const firstMonday = jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86_400_000;
  const week = Math.round((monday.getTime() - firstMonday) / (7 * 86_400_000)) + 1;
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** 플러그인에 실린 Weekly 엔진(sugo/weekly). Launcher가 넘긴 경로, 설치된 Plugin, 번들·소스 실행 위치 순으로 찾는다. */
export function weeklyEngineCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [process.env.SUGO_WEEKLY_ENGINE, installedPluginEngine(), resolve(here, "../weekly"), resolve(here, "../../../../sugo/weekly")].filter((path): path is string => Boolean(path));
}

function installedPluginEngine(): string | undefined {
  const registry = join(process.env.SUGO_HOME_OVERRIDE ?? homedir(), ".claude", "plugins", "installed_plugins.json");
  try {
    const plugins = (JSON.parse(readFileSync(registry, "utf8")) as { plugins?: Record<string, { installPath?: string }[]> }).plugins ?? {};
    const installPath = plugins["sugo@sugo-marketplace"]?.[0]?.installPath;
    return installPath ? join(installPath, "weekly") : undefined;
  } catch {
    return undefined;
  }
}

export async function findWeeklyEngine(candidates = weeklyEngineCandidates()): Promise<string | null> {
  for (const candidate of candidates) {
    try { await stat(join(candidate, "run.mjs")); return candidate; } catch { /* 다음 후보 */ }
  }
  return null;
}

/** 별도 weekly 플러그인이 설치한 LaunchAgent를 끄고 지운다. 예약은 이제 Console이 맡으므로 두 번 생성되지 않게 한다. */
export async function retireLegacyWeeklyAgents(home = homedir()): Promise<string[]> {
  const agents = join(home, "Library", "LaunchAgents");
  let names: string[];
  try { names = await readdir(agents); } catch { return []; }
  const legacy = names.filter((name) => /^com\..+\.weekly-ai-report(-server)?\.plist$/.test(name));
  for (const name of legacy) {
    const path = join(agents, name);
    // 이미 내려가 있으면 bootout이 실패한다. 파일만 지우면 된다.
    await execFileAsync("launchctl", ["bootout", `gui/${process.getuid?.() ?? 0}`, path]).catch(() => undefined);
    await unlink(path);
  }
  return legacy;
}

export interface WeeklyScheduleOptions {
  weeklyHome?: string;
  /** LaunchAgents를 찾을 HOME. */
  home?: string;
  engine?: () => Promise<string | null>;
  build?: (engine: string, week: string) => Promise<{ stdout: string; stderr: string }>;
  now?: () => Date;
  intervalMs?: number;
}

export interface WeeklyPendingRun { week: string; attempts: number; nextAttemptAt: string; lastError?: string }
export interface WeeklyFailedRun { week: string; attempts: number; lastError: string }
export interface WeeklyRunState { pending: WeeklyPendingRun[]; failed: WeeklyFailedRun[] }

export const WEEKLY_MAX_ATTEMPTS = 6;
const RETRY_BASE_MS = 15 * 60_000;
const KEPT_FAILURES = 10;

/** n번째 실패 뒤 다시 시도할 때까지 기다리는 시간. 15분부터 두 배씩 늘린다. */
export function weeklyRetryDelayMs(attempts: number): number {
  return RETRY_BASE_MS * 2 ** (attempts - 1);
}

async function readSchedule(configPath: string): Promise<WeeklySchedule> {
  try {
    const schedule = (JSON.parse(await readFile(configPath, "utf8")) as { schedule?: Partial<WeeklySchedule> }).schedule ?? {};
    return { enabled: schedule.enabled ?? false, weekday: schedule.weekday ?? 5, hour: schedule.hour ?? 17, minute: schedule.minute ?? 0 };
  } catch {
    return { enabled: false, weekday: 5, hour: 17, minute: 0 };
  }
}

export function weeklyRunStatePath(weeklyHome: string): string {
  return join(weeklyHome, "scheduled-runs.json");
}

export function weeklyReportPath(weeklyHome: string, week: string): string {
  return join(process.env.WEEKLY_REPORT_OUT ?? join(weeklyHome, "reports"), `${week}.html`);
}

export async function readWeeklyRunState(weeklyHome: string): Promise<WeeklyRunState | null> {
  try {
    const state = JSON.parse(await readFile(weeklyRunStatePath(weeklyHome), "utf8")) as Partial<WeeklyRunState>;
    return { pending: state.pending ?? [], failed: state.failed ?? [] };
  } catch {
    return null;
  }
}

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

/**
 * 예약 한 번 확인. 지난 예약 시점마다 만들 주를 대기 목록에 넣고, 차례가 된 주 하나를 만든다.
 * 실패한 주는 늦춰 가며 다시 시도하고, WEEKLY_MAX_ATTEMPTS번 실패하면 failed로 옮겨 화면에 알린다.
 */
export function createWeeklyScheduleTick(options: WeeklyScheduleOptions = {}): () => Promise<void> {
  const weeklyHome = options.weeklyHome ?? weeklyHomeDir();
  const handledPath = join(weeklyHome, "last-scheduled-slot");
  const logPath = join(weeklyHome, "scheduled-run.log");
  const engine = options.engine ?? (() => findWeeklyEngine());
  const build = options.build ?? ((path: string, week: string) => execFileAsync(process.execPath, [join(path, "run.mjs"), "build", "--week", week], { cwd: path, timeout: 30 * 60_000, maxBuffer: 16 * 1024 * 1024 }));
  const now = options.now ?? (() => new Date());
  const log = (line: string) => appendFile(logPath, `[${now().toISOString()}] ${line}\n`).catch(() => undefined);

  return async () => {
    const schedule = await readSchedule(join(weeklyHome, "config.json"));
    if (!schedule.enabled) return;
    const at = now();
    const latest = latestWeeklySlot(at, schedule).toISOString();
    const handled = await readFile(handledPath, "utf8").then((value) => value.trim() || null, () => null);
    await mkdir(weeklyHome, { recursive: true });
    const saved = await readWeeklyRunState(weeklyHome);
    const state: WeeklyRunState = structuredClone(saved ?? { pending: [], failed: [] });
    const enqueue = (week: string) => {
      if (state.pending.some((run) => run.week === week)) return;
      state.failed = state.failed.filter((run) => run.week !== week);
      state.pending.push({ week, attempts: 0, nextAttemptAt: at.toISOString() });
    };
    // 처음 켰을 때는 지난 시점을 만들지 않는다. 예전 버전이 처리했다고만 기록하고 만들지 못한 주는 한 번 되살린다.
    if (handled !== null) {
      if (saved === null && !(await exists(weeklyReportPath(weeklyHome, weeklyLabelForRun(new Date(handled)))))) enqueue(weeklyLabelForRun(new Date(handled)));
      for (const slot of weeklySlotsSince(handled, at, schedule)) enqueue(weeklyLabelForRun(new Date(slot)));
    }
    const writeState = () => writeFile(weeklyRunStatePath(weeklyHome), `${JSON.stringify(state, null, 2)}\n`, "utf8");
    if (saved === null || JSON.stringify(saved) !== JSON.stringify(state)) await writeState();
    if (handled !== latest) await writeFile(handledPath, `${latest}\n`, "utf8");

    const run = state.pending.find((item) => item.nextAttemptAt <= at.toISOString());
    if (!run) return;
    try {
      const path = await engine();
      if (!path) throw new Error("weekly engine not found");
      const out = await build(path, run.week);
      state.pending = state.pending.filter((item) => item !== run);
      await log(`ok ${run.week}\n${out.stdout.slice(-2000)}`);
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
      run.attempts += 1;
      run.lastError = message;
      run.nextAttemptAt = new Date(now().getTime() + weeklyRetryDelayMs(run.attempts)).toISOString();
      if (run.attempts >= WEEKLY_MAX_ATTEMPTS) {
        state.pending = state.pending.filter((item) => item !== run);
        state.failed = [...state.failed, { week: run.week, attempts: run.attempts, lastError: message }].slice(-KEPT_FAILURES);
      }
      console.error("[dashboard] weekly scheduled run failed:", message);
      await log(`failed ${run.week} (${run.attempts}/${WEEKLY_MAX_ATTEMPTS}) ${message}`);
    }
    await writeState();
  };
}

/** 1분마다 예약을 확인한다. 생성 결과는 엔진이 Console에 올린다. */
export function startWeeklySchedule(options: WeeklyScheduleOptions = {}): () => void {
  const check = createWeeklyScheduleTick(options);
  let running = false;
  let stopped = false;

  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      await check();
    } catch (error) {
      console.error("[dashboard] weekly schedule check failed:", error instanceof Error ? error.message : error);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => { void tick(); }, options.intervalMs ?? 60_000);
  timer.unref?.();
  void retireLegacyWeeklyAgents(options.home)
    .then((retired) => { if (retired.length > 0) console.log(`[dashboard] retired weekly LaunchAgents: ${retired.join(", ")}`); })
    .catch((error) => console.error("[dashboard] weekly LaunchAgent cleanup failed:", error instanceof Error ? error.message : error));
  void tick();
  return () => { stopped = true; clearInterval(timer); };
}
