import { execFile } from "node:child_process";
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

/**
 * 이번 확인에서 생성할지 정한다. record는 처리한 예약 시점으로 남길 값이다.
 * 처리 기록이 없으면(처음 켬) 지난 시점을 실행하지 않고 기록만 한다. Console이 꺼져 있다 켜지면 밀린 시점을 한 번만 실행한다.
 */
export function weeklyRunDecision(now: Date, schedule: WeeklySchedule, handled: string | null): { run: boolean; record: string | null } {
  if (!schedule.enabled) return { run: false, record: null };
  const slot = latestWeeklySlot(now, schedule).toISOString();
  if (handled === null) return { run: false, record: slot };
  return handled < slot ? { run: true, record: slot } : { run: false, record: null };
}

/** 플러그인에 실린 Weekly 엔진(sugo/weekly). 번들(dashboard-runtime/server.mjs)과 소스 실행 위치를 모두 찾는다. */
export function weeklyEngineCandidates(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [process.env.SUGO_WEEKLY_ENGINE, resolve(here, "../weekly"), resolve(here, "../../../../sugo/weekly")].filter((path): path is string => Boolean(path));
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
  build?: (engine: string) => Promise<{ stdout: string; stderr: string }>;
  intervalMs?: number;
}

async function readSchedule(configPath: string): Promise<WeeklySchedule> {
  try {
    const schedule = (JSON.parse(await readFile(configPath, "utf8")) as { schedule?: Partial<WeeklySchedule> }).schedule ?? {};
    return { enabled: schedule.enabled ?? false, weekday: schedule.weekday ?? 5, hour: schedule.hour ?? 17, minute: schedule.minute ?? 0 };
  } catch {
    return { enabled: false, weekday: 5, hour: 17, minute: 0 };
  }
}

/** 1분마다 예약을 확인하고, 시점이 지났으면 엔진으로 한 주를 생성한다. 생성 결과는 엔진이 Console에 올린다. */
export function startWeeklySchedule(options: WeeklyScheduleOptions = {}): () => void {
  const weeklyHome = options.weeklyHome ?? weeklyHomeDir();
  const handledPath = join(weeklyHome, "last-scheduled-slot");
  const logPath = join(weeklyHome, "scheduled-run.log");
  const engine = options.engine ?? (() => findWeeklyEngine());
  const build = options.build ?? ((path: string) => execFileAsync(process.execPath, [join(path, "run.mjs"), "build"], { cwd: path, timeout: 30 * 60_000, maxBuffer: 16 * 1024 * 1024 }));
  let running = false;
  let stopped = false;

  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const handled = await readFile(handledPath, "utf8").then((value) => value.trim() || null, () => null);
      const decision = weeklyRunDecision(new Date(), await readSchedule(join(weeklyHome, "config.json")), handled);
      if (decision.record === null) return;
      await mkdir(weeklyHome, { recursive: true });
      // 실패해도 같은 시점을 다시 실행하지 않도록 먼저 기록한다. Claude 호출 비용이 매분 반복되는 것을 막는다.
      await writeFile(handledPath, `${decision.record}\n`, "utf8");
      if (!decision.run) return;
      const path = await engine();
      if (!path) throw new Error("weekly engine not found");
      const out = await build(path);
      await appendFile(logPath, `[${new Date().toISOString()}] ok ${decision.record}\n${out.stdout.slice(-2000)}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[dashboard] weekly scheduled run failed:", message);
      await appendFile(logPath, `[${new Date().toISOString()}] failed ${message.slice(0, 2000)}\n`).catch(() => undefined);
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
