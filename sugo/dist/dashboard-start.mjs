import { createRequire as __sugoCreateRequire } from "node:module";
import { fileURLToPath as __sugoFileURLToPath } from "node:url";
import { dirname as __sugoDirname } from "node:path";
const require = __sugoCreateRequire(import.meta.url);
const __filename = __sugoFileURLToPath(import.meta.url);
const __dirname = __sugoDirname(__filename);

// src/lifecycle/dashboardStartHook.ts
import { dirname, join as join2 } from "node:path";
import { fileURLToPath } from "node:url";

// src/version.ts
function currentSugoVersion() {
  return true ? "0.34.2" : "0.0.0-dev";
}

// src/lifecycle/dashboardRuntime.ts
import { spawn } from "node:child_process";
import { closeSync, existsSync, openSync } from "node:fs";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";

// src/homeDir.ts
import { homedir } from "node:os";
function sugoHomeDir() {
  return process.env.SUGO_HOME_OVERRIDE ?? homedir();
}

// src/lifecycle/dashboardRuntime.ts
var DEFAULT_DASHBOARD_PORT = 3001;
function configuredDashboardPort() {
  return process.env.SUGO_DASHBOARD_PORT ? Number(process.env.SUGO_DASHBOARD_PORT) : DEFAULT_DASHBOARD_PORT;
}
var HEALTH_TIMEOUT_MS = 1500;
var START_WAIT_MS = 6e3;
var STOP_WAIT_MS = 5e3;
var POLL_MS = 150;
var LOCK_STALE_MS = 3e4;
function dashboardPaths(home = sugoHomeDir()) {
  const sugoDir = join(home, ".claude", "sugo");
  const dataDir = join(sugoDir, "dashboard");
  return {
    sugoDir,
    dataDir,
    stateFile: join(dataDir, "server.json"),
    logFile: join(dataDir, "dashboard.log"),
    lockDir: join(dataDir, "start.lock"),
    settingsFile: join(sugoDir, "settings.json")
  };
}
function isSupportedNode(version = process.versions.node) {
  const [major = 0, minor = 0] = version.split(".").map(Number);
  return major > 22 || major === 22 && minor >= 5;
}
async function readServerState(paths) {
  try {
    return JSON.parse(await readFile(paths.stateFile, "utf8"));
  } catch {
    return null;
  }
}
async function fetchHealth(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) });
    if (!res.ok) return null;
    const body = await res.json();
    return body.status === "ok" ? body : null;
  } catch {
    return null;
  }
}
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
var sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitUntil(done, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await done()) return true;
    await sleep(POLL_MS);
  }
  return done();
}
async function stopDashboard(paths) {
  const state = await readServerState(paths);
  if (!state) return { stopped: true, unverified: false };
  if (!isAlive(state.pid)) {
    await rm(paths.stateFile, { force: true });
    return { stopped: true, unverified: false };
  }
  if (!await fetchHealth(state.port)) return { stopped: false, unverified: true };
  process.kill(state.pid, "SIGTERM");
  if (!await waitUntil(() => !isAlive(state.pid), STOP_WAIT_MS)) process.kill(state.pid, "SIGKILL");
  await waitUntil(() => !isAlive(state.pid), STOP_WAIT_MS);
  await rm(paths.stateFile, { force: true });
  return { stopped: !isAlive(state.pid), unverified: false };
}
async function readEnabled(settingsFile) {
  try {
    const settings = JSON.parse(await readFile(settingsFile, "utf8"));
    const enabled = settings.dashboard?.enabled;
    return typeof enabled === "boolean" ? enabled : void 0;
  } catch {
    return void 0;
  }
}
async function acquireLock(paths) {
  await mkdir(paths.dataDir, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await mkdir(paths.lockDir);
      return true;
    } catch {
      const age = await stat(paths.lockDir).then((s) => Date.now() - s.mtimeMs, () => 0);
      if (age < LOCK_STALE_MS) return false;
      await rm(paths.lockDir, { recursive: true, force: true });
    }
  }
  return false;
}
async function startServer(runtimeEntry, options, paths, port) {
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
      HARNESS_OVERRIDE_PATH: join(sugoHomeDir(), ".claude", "sugo", "harness-overrides"),
      SKILLS_PATH: options.pluginRoot
    }
  });
  child.on("exit", () => {
    exited = true;
  });
  child.unref();
  closeSync(log);
  const healthy = await waitUntil(async () => exited || (await fetchHealth(port))?.build === options.buildId, START_WAIT_MS);
  if (healthy && !exited) return { kind: "started" };
  return { kind: "failed", message: `Sugo \uB300\uC2DC\uBCF4\uB4DC\uB97C \uC2DC\uC791\uD558\uC9C0 \uBABB\uD588\uB2E4. \uB85C\uADF8: ${paths.logFile}. sugo\uC758 \uB2E4\uB978 \uAE30\uB2A5\uC740 \uADF8\uB300\uB85C \uB3D9\uC791\uD55C\uB2E4.` };
}
async function ensureDashboard(options) {
  const port = options.port ?? configuredDashboardPort();
  const paths = options.paths ?? dashboardPaths();
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const runtimeEntry = join(options.pluginRoot, "dashboard-runtime", "server.mjs");
  try {
    if (!isSupportedNode(nodeVersion)) {
      return {
        kind: "skipped",
        reason: "node-too-old",
        message: `Sugo \uB300\uC2DC\uBCF4\uB4DC\uB294 Node 22.5 \uC774\uC0C1\uC774 \uD544\uC694\uD558\uB2E4(\uD604\uC7AC ${nodeVersion}). Node\uB97C \uC124\uCE58\uD55C \uB4A4 \uC0C8 \uC138\uC158\uC744 \uC5F0\uB2E4. sugo\uC758 \uB2E4\uB978 \uAE30\uB2A5\uC740 \uADF8\uB300\uB85C \uB3D9\uC791\uD55C\uB2E4.`
      };
    }
    if (await readEnabled(paths.settingsFile) === false) return { kind: "skipped", reason: "opt-out" };
    if (!existsSync(runtimeEntry)) return { kind: "skipped", reason: "no-runtime" };
    const health = await fetchHealth(port);
    const state = await readServerState(paths);
    const owned = state !== null && state.port === port && isAlive(state.pid);
    if (health && !owned) return { kind: "running" };
    if (health && health.build === options.buildId) return { kind: "running" };
    if (health) await stopDashboard(paths);
    else if (state) await rm(paths.stateFile, { force: true });
    if (!await acquireLock(paths)) return { kind: "busy" };
    try {
      if ((await fetchHealth(port))?.build === options.buildId) return { kind: "running" };
      const firstTime = await readEnabled(paths.settingsFile) !== true;
      const started = await startServer(runtimeEntry, options, paths, port);
      if (started.kind === "started" && firstTime) return { kind: "started", message: `Sugo \uB300\uC2DC\uBCF4\uB4DC\uB97C \uC2DC\uC791\uD588\uB2E4: http://localhost:${port}` };
      return started;
    } finally {
      await rm(paths.lockDir, { recursive: true, force: true });
    }
  } catch (error) {
    return { kind: "failed", message: `Sugo \uB300\uC2DC\uBCF4\uB4DC\uB97C \uC2DC\uC791\uD558\uC9C0 \uBABB\uD588\uB2E4: ${error.message}. sugo\uC758 \uB2E4\uB978 \uAE30\uB2A5\uC740 \uADF8\uB300\uB85C \uB3D9\uC791\uD55C\uB2E4.` };
  }
}

// src/lifecycle/dashboardStartHook.ts
var pluginRoot = join2(dirname(fileURLToPath(import.meta.url)), "..");
var result = await ensureDashboard({ pluginRoot, buildId: currentSugoVersion() });
if ("message" in result && result.message) console.log(JSON.stringify({ systemMessage: result.message }));
process.exit(0);
