// 깨끗한 HOME에서 "플러그인만 설치"한 사용자의 대시보드 경험을 끝까지 실행해 확인한다.
// 설치본(배포 파일만) → 세션 시작 훅 → 실제 MCP 동기화 → 화면 → 업데이트 → uninstall/restore/purge.
// 서버는 임시 HOME과 빈 포트에서만 뜨고, 실제 ~/.claude/sugo와 개발 서버는 건드리지 않는다.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { build } from "esbuild";

const source = join(dirname(fileURLToPath(import.meta.url)), "..");
const shipped = [".claude-plugin", "dist", "dashboard-runtime", "harness-library", "wasm-grammars", "commands", "agents", "skills", "hooks", "scripts"];
const root = mkdtempSync(join(tmpdir(), "sugo-dashboard-e2e-"));
const failures = [];
const check = (label, pass, detail = "") => { console.log(`${pass ? "PASS" : "FAIL"} ${label}${pass || !detail ? "" : ` — ${detail}`}`); if (!pass) failures.push(label); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const freePort = () => new Promise((resolve) => {
  const probe = createServer().listen(0, "127.0.0.1", () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
});
const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const home = join(root, "home");
const project = join(root, "project");
const env = { ...process.env, SUGO_HOME_OVERRIDE: home, SUGO_DASHBOARD_PORT: String(port) };
const dashDir = join(home, ".claude", "sugo", "dashboard");
const settingsPath = join(home, ".claude", "sugo", "settings.json");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const health = () => fetch(`${base}/health`, { signal: AbortSignal.timeout(1500) }).then((r) => r.json(), () => null);
const statePid = () => (existsSync(join(dashDir, "server.json")) ? readJson(join(dashDir, "server.json")).pid : null);
const runHook = (pluginDir) => spawnSync(process.execPath, [join(pluginDir, "dist", "dashboard-start.mjs")], { env, encoding: "utf8" });
const api = (path, init = {}) => {
  const { apiToken } = readJson(settingsPath).dashboard;
  return fetch(`${base}${path}`, { ...init, headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json", ...init.headers } });
};

let mcp = null;
function startMcp(pluginDir) {
  const server = spawn(process.execPath, [join(pluginDir, "dist", "index.bundle.mjs")], { env, stdio: ["pipe", "pipe", "inherit"] });
  let buffer = ""; let id = 0; const pending = new Map();
  server.stdout.on("data", (chunk) => { buffer += chunk; let at; while ((at = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, at).trim(); buffer = buffer.slice(at + 1); if (!line) continue;
    const message = JSON.parse(line); if (pending.has(message.id)) { pending.get(message.id)(message); pending.delete(message.id); }
  }});
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const requestId = ++id; pending.set(requestId, resolve);
    server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params })}\n`);
    setTimeout(() => reject(new Error(`timeout: ${method}`)), 30000);
  });
  return { server, rpc, call: async (name, args) => JSON.parse((await rpc("tools/call", { name, arguments: args })).result?.content?.[0]?.text ?? "{}"),
    init: async () => { await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "dashboard-e2e", version: "0" } });
      server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`); } };
}

async function waitFor(label, probe, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) { const value = await probe(); if (value) return value; await sleep(200); }
  return null;
}

try {
  const plugin = join(root, "plugin");
  mkdirSync(plugin, { recursive: true }); mkdirSync(home); mkdirSync(project);
  for (const path of shipped) cpSync(join(source, path), join(plugin, path), { recursive: true });
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "e2e-project" }));
  const pluginVersion = readJson(join(plugin, ".claude-plugin", "plugin.json")).version;
  const consoleVersion = readJson(join(plugin, "dashboard-runtime", "runtime.json")).consoleVersion;

  // 1. 첫 세션: 서버가 뜨고 연결 설정이 자동으로 채워진다.
  const first = runHook(plugin);
  check("첫 세션 훅이 정상 종료하고 시작을 알린다", first.status === 0 && first.stdout.includes("Sugo 대시보드를 시작했다"), first.stdout + first.stderr);
  const up = await health();
  check("서버가 응답하고 Console·Plugin 버전이 맞다", up?.status === "ok" && up.version === consoleVersion && up.build === pluginVersion, JSON.stringify(up));
  const settings = existsSync(settingsPath) ? readJson(settingsPath).dashboard : {};
  check("연결 설정이 자동으로 켜진다(사용자 작업 없음)", settings.enabled === true && settings.apiUrl === `http://localhost:${port}` && String(settings.apiToken).startsWith("sugo_pat_"));
  const page = await fetch(`${base}/`).then((r) => r.text());
  const spa = await fetch(`${base}/weekly`);
  check("한 포트에서 UI(정적 빌드)와 SPA 경로를 제공한다", page.includes('id="root"') && spa.status === 200 && (await spa.text()).includes('id="root"'));
  check("DB·세션 비밀·로그가 사용자 데이터 폴더에 있다", ["dashboard.db", "session-secret", "dashboard.log"].every((f) => existsSync(join(dashDir, f))));
  const pid = statePid();

  // 2. 두 번째 세션: 다시 띄우지 않는다.
  const second = runHook(plugin);
  check("두 번째 세션은 조용하고 서버는 그대로 하나다", second.status === 0 && second.stdout === "" && statePid() === pid);

  // 3. sugo 동기화(실제 MCP, 환경변수 없이 settings.json만 사용).
  mcp = startMcp(plugin); await mcp.init();
  const added = await mcp.call("sugo_add", { projectPath: project, workspace: "e2e-ws" });
  const synced = await waitFor("workspace sync", async () => (await (await api("/api/workspaces")).json()).workspaces?.some((w) => w.name === "e2e-ws"));
  check("sugo 동기화가 대시보드에 도달한다", added.ok !== false && Boolean(synced));

  // 4. Weekly: weekly가 플러그인 토큰으로 올린 보고서가 본인에게만 보인다.
  const report = { start: "2026-10-05", end: "2026-10-11", generatedAt: "2026-10-16T10:24:00+09:00", report: { headline: ["요약"], topics: [{ title: "주제", workspace: "ws", category: "기능", one_line: "한 줄", done: ["추가"], results: [], todo: [] }], next_week: [], blocked: [], last_week_plan: [] } };
  const put = await api("/api/weekly/reports/2026-W41", { method: "PUT", body: JSON.stringify(report) });
  const list = await (await api("/api/weekly/reports")).json();
  const anonymous = await fetch(`${base}/api/weekly/reports`);
  check("Weekly 보고서를 올리고 읽을 수 있고, 토큰 없이는 읽을 수 없다", put.status === 200 && list.reports?.[0]?.weekId === "2026-W41" && anonymous.status === 401);

  // 5. 대시보드가 갑자기 죽어도 파이프라인은 막히지 않는다.
  process.kill(pid, "SIGKILL");
  await waitFor("server down", async () => !(await health()), 5000);
  const started = Date.now();
  const whileDown = await mcp.call("sugo_add", { projectPath: project, workspace: "e2e-ws" });
  check("대시보드가 죽은 동안에도 sugo 명령이 끝까지 동작한다", whileDown.ok !== false && Date.now() - started < 20000, `${Date.now() - started}ms`);
  const recovered = runHook(plugin);
  check("다음 세션 훅이 죽은 서버를 정리하고 다시 띄운다", recovered.status === 0 && (await health())?.status === "ok" && statePid() !== pid);

  // 6. 플러그인 업데이트: 새 버전 번들이 서버를 교체하고 데이터는 유지된다.
  const plugin2 = join(root, "plugin2");
  cpSync(plugin, plugin2, { recursive: true });
  await build({ entryPoints: [join(source, "src", "lifecycle", "dashboardStartHook.ts")], bundle: true, platform: "node", format: "esm",
    outfile: join(plugin2, "dist", "dashboard-start.mjs"), define: { __SUGO_VERSION__: JSON.stringify("99.0.0") } });
  const beforeUpdate = statePid();
  const updated = runHook(plugin2);
  const afterUpdate = await health();
  const stillThere = (await (await api("/api/workspaces")).json()).workspaces?.some((w) => w.name === "e2e-ws");
  check("업데이트하면 새 버전 서버로 교체되고 데이터가 유지된다", updated.status === 0 && afterUpdate?.build === "99.0.0" && statePid() !== beforeUpdate && stillThere,
    JSON.stringify({ status: updated.status, stdout: updated.stdout, stderr: updated.stderr, build: afterUpdate?.build, beforeUpdate, after: statePid(), stillThere }));
  const updatedPid = statePid();
  const sameAgain = runHook(plugin2);
  check("업데이트 뒤 같은 버전 세션은 다시 띄우지 않는다", sameAgain.stdout === "" && statePid() === updatedPid);

  // 7. uninstall(retain) → restore → purge.
  const retained = await mcp.call("sugo_uninstall", { action: "execute", mode: "retain", confirmation: "UNINSTALL_SUGO" });
  const archive = join(home, ".sugo", "data", "dashboard");
  check("uninstall: 서버가 멈추고 데이터가 비활성 보관된다", retained.ok === true && !(await health()) && existsSync(join(archive, "dashboard.db")) && !existsSync(join(archive, "server.json")) && !existsSync(join(home, ".claude", "sugo")));
  const restored = await mcp.call("sugo_uninstall", { action: "restore" });
  const afterRestore = await waitFor("restored server", health);
  const workspacesBack = afterRestore ? (await (await api("/api/workspaces")).json()).workspaces?.some((w) => w.name === "e2e-ws") : false;
  const reportBack = afterRestore ? (await (await api("/api/weekly/reports")).json()).reports?.length === 1 : false;
  check("restore: 데이터를 되살리고 서버가 다시 뜬다(워크스페이스·보고서 유지)", restored.ok === true && restored.dashboard === "started" && workspacesBack && reportBack);
  const purged = await mcp.call("sugo_uninstall", { action: "execute", mode: "purge", confirmation: "DELETE_SUGO_DATA" });
  check("purge: 서버가 멈추고 활성·보관 데이터가 모두 지워진다", purged.ok === true && !(await health()) && !existsSync(join(home, ".claude", "sugo")) && !existsSync(join(home, ".sugo")));
} catch (error) {
  check("e2e 실행 중 예외 없음", false, error instanceof Error ? error.stack : String(error));
} finally {
  mcp?.server.kill();
  const left = existsSync(join(dashDir, "server.json")) ? readJson(join(dashDir, "server.json")).pid : null;
  if (left) { try { process.kill(left, "SIGKILL"); } catch { /* 이미 종료됨 */ } }
  rmSync(root, { recursive: true, force: true });
}

if (failures.length) { console.error(`\n${failures.length}건 실패`); process.exit(1); }
console.log("\n대시보드 종단 검증 통과");
