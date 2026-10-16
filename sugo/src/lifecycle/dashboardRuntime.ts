import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { sugoHomeDir } from "../homeDir.js";

/** 개인용 로컬 대시보드 서버의 실행·정지·상태. 세션 시작 훅과 uninstall이 같은 규칙을 쓴다. */

export const DEFAULT_DASHBOARD_PORT = 3001;

/** SUGO_DASHBOARD_PORT는 검증용 시임이다. 평소에는 설정하지 않으며 기본 포트를 쓴다. */
export function configuredDashboardPort(): number {
  return process.env.SUGO_DASHBOARD_PORT ? Number(process.env.SUGO_DASHBOARD_PORT) : DEFAULT_DASHBOARD_PORT;
}
const HEALTH_TIMEOUT_MS = 1500;
const START_WAIT_MS = 6000;
const STOP_WAIT_MS = 5000;
const POLL_MS = 150;
const LOCK_STALE_MS = 30_000;

export interface DashboardPaths {
  sugoDir: string;
  dataDir: string;
  stateFile: string;
  logFile: string;
  lockDir: string;
  settingsFile: string;
}

export function dashboardPaths(home: string = sugoHomeDir()): DashboardPaths {
  const sugoDir = join(home, ".claude", "sugo");
  const dataDir = join(sugoDir, "dashboard");
  return {
    sugoDir,
    dataDir,
    stateFile: join(dataDir, "server.json"),
    logFile: join(dataDir, "dashboard.log"),
    lockDir: join(dataDir, "start.lock"),
    settingsFile: join(sugoDir, "settings.json"),
  };
}

/** node:sqlite는 22.5부터 있다. */
export function isSupportedNode(version: string = process.versions.node): boolean {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return major > 22 || (major === 22 && minor >= 5);
}

export interface ServerState {
  pid: number;
  port: number;
  version?: string;
  startedAt: string;
}

export async function readServerState(paths: DashboardPaths): Promise<ServerState | null> {
  try {
    return JSON.parse(await readFile(paths.stateFile, "utf8")) as ServerState;
  } catch {
    // 상태 파일이 없거나 쓰는 도중이면 실행 중인 서버를 알 수 없다.
    return null;
  }
}

export interface Health {
  status: string;
  version: string;
  build: string;
}

export async function fetchHealth(port: number): Promise<Health | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = (await res.json()) as Health;
    return body.status === "ok" ? body : null;
  } catch {
    // 연결 거부·시간 초과는 "응답하는 서버 없음"이다.
    return null;
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntil(done: () => boolean | Promise<boolean>, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await done()) return true;
    await sleep(POLL_MS);
  }
  return done();
}

export interface StopResult {
  /** 서버를 멈췄거나 이미 멈춰 있었다. */
  stopped: boolean;
  /** 프로세스는 살아 있으나 우리 서버임을 확인하지 못해 건드리지 않았다. */
  unverified: boolean;
}

/**
 * 기록된 서버를 멈춘다. PID는 재부팅 뒤 다른 프로세스가 물려받을 수 있으므로,
 * 기록된 포트가 대시보드 health에 응답할 때만 종료 신호를 보낸다.
 */
export async function stopDashboard(paths: DashboardPaths): Promise<StopResult> {
  const state = await readServerState(paths);
  if (!state) return { stopped: true, unverified: false };
  if (!isAlive(state.pid)) {
    await rm(paths.stateFile, { force: true });
    return { stopped: true, unverified: false };
  }
  if (!(await fetchHealth(state.port))) return { stopped: false, unverified: true };

  process.kill(state.pid, "SIGTERM");
  if (!(await waitUntil(() => !isAlive(state.pid), STOP_WAIT_MS))) process.kill(state.pid, "SIGKILL");
  await waitUntil(() => !isAlive(state.pid), STOP_WAIT_MS);
  await rm(paths.stateFile, { force: true });
  return { stopped: !isAlive(state.pid), unverified: false };
}

/** settings.json의 dashboard.enabled. 키가 없으면 undefined — 사용자가 끈 것(false)과 구별한다. */
async function readEnabled(settingsFile: string): Promise<boolean | undefined> {
  try {
    const settings = JSON.parse(await readFile(settingsFile, "utf8")) as { dashboard?: { enabled?: unknown } };
    const enabled = settings.dashboard?.enabled;
    return typeof enabled === "boolean" ? enabled : undefined;
  } catch {
    // 설정이 없으면 사용자가 정한 값이 없다.
    return undefined;
  }
}

/** 동시에 여러 세션이 열려도 서버는 하나만 띄운다. mkdir는 원자적이다. */
async function acquireLock(paths: DashboardPaths): Promise<boolean> {
  await mkdir(paths.dataDir, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await mkdir(paths.lockDir);
      return true;
    } catch {
      // 다른 세션이 잡고 있다. 오래된 잠금(시작 중 비정상 종료)이면 치우고 한 번 더 시도한다.
      const age = await stat(paths.lockDir).then((s) => Date.now() - s.mtimeMs, () => 0);
      if (age < LOCK_STALE_MS) return false;
      await rm(paths.lockDir, { recursive: true, force: true });
    }
  }
  return false;
}

export type EnsureResult =
  | { kind: "running"; message?: string }
  | { kind: "started"; message?: string }
  | { kind: "busy" }
  | { kind: "skipped"; reason: "opt-out" | "no-runtime" | "node-too-old"; message?: string }
  | { kind: "failed"; message: string };

export interface EnsureOptions {
  pluginRoot: string;
  /** 서버가 /health에 싣는 빌드 식별자. 플러그인 버전이 바뀌면 서버를 교체한다. */
  buildId: string;
  port?: number;
  nodeVersion?: string;
  paths?: DashboardPaths;
}

async function startServer(runtimeEntry: string, options: EnsureOptions, paths: DashboardPaths, port: number): Promise<EnsureResult> {
  const log = openSync(paths.logFile, "a");
  let exited = false;
  const child = spawn(process.execPath, [runtimeEntry], {
    detached: true,
    windowsHide: true,
    stdio: ["ignore", log, log],
    env: {
      ...process.env,
      SUGO_DASHBOARD_PORT: String(port),
      BUILD_ID: options.buildId,
      HARNESS_PATH: join(options.pluginRoot, "harness-library"),
      SKILLS_PATH: options.pluginRoot,
    },
  });
  child.on("exit", () => {
    exited = true;
  });
  child.unref();
  closeSync(log);

  const healthy = await waitUntil(async () => exited || (await fetchHealth(port))?.build === options.buildId, START_WAIT_MS);
  if (healthy && !exited) return { kind: "started" };
  return { kind: "failed", message: `Sugo 대시보드를 시작하지 못했다. 로그: ${paths.logFile}. sugo의 다른 기능은 그대로 동작한다.` };
}

/** 세션 시작 때 호출한다. 어떤 경우에도 던지지 않고 결과를 돌려준다(대시보드가 파이프라인을 막지 않는다). */
export async function ensureDashboard(options: EnsureOptions): Promise<EnsureResult> {
  const port = options.port ?? configuredDashboardPort();
  const paths = options.paths ?? dashboardPaths();
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const runtimeEntry = join(options.pluginRoot, "dashboard-runtime", "server.mjs");

  try {
    if (!isSupportedNode(nodeVersion)) {
      return {
        kind: "skipped",
        reason: "node-too-old",
        message: `Sugo 대시보드는 Node 22.5 이상이 필요하다(현재 ${nodeVersion}). Node를 설치한 뒤 새 세션을 연다. sugo의 다른 기능은 그대로 동작한다.`,
      };
    }
    if ((await readEnabled(paths.settingsFile)) === false) return { kind: "skipped", reason: "opt-out" };
    if (!existsSync(runtimeEntry)) return { kind: "skipped", reason: "no-runtime" };

    const health = await fetchHealth(port);
    const state = await readServerState(paths);
    const owned = state !== null && state.port === port && isAlive(state.pid);
    // 개발용 대시보드 등 우리가 띄우지 않은 서버가 응답 중이면 그대로 쓰고 건드리지 않는다.
    if (health && !owned) return { kind: "running" };
    if (health && health.build === options.buildId) return { kind: "running" };
    if (health) await stopDashboard(paths);
    else if (state) await rm(paths.stateFile, { force: true });

    if (!(await acquireLock(paths))) return { kind: "busy" };
    try {
      if ((await fetchHealth(port))?.build === options.buildId) return { kind: "running" };
      const firstTime = (await readEnabled(paths.settingsFile)) !== true;
      const started = await startServer(runtimeEntry, options, paths, port);
      if (started.kind === "started" && firstTime) return { kind: "started", message: `Sugo 대시보드를 시작했다: http://localhost:${port}` };
      return started;
    } finally {
      await rm(paths.lockDir, { recursive: true, force: true });
    }
  } catch (error) {
    return { kind: "failed", message: `Sugo 대시보드를 시작하지 못했다: ${(error as Error).message}. sugo의 다른 기능은 그대로 동작한다.` };
  }
}
