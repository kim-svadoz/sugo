import { createServer, type Server } from "node:http";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  browserCommand,
  controlDashboard,
  dashboardPaths,
  ensureDashboard,
  fetchHealth,
  isSupportedNode,
  readServerState,
  stopDashboard,
  type DashboardPaths,
} from "../src/lifecycle/dashboardRuntime.js";
import { freePort } from "./fixtures/freePort.js";

let home: string;
let pluginRoot: string;
let paths: DashboardPaths;
let port: number;
let foreign: Server | null = null;

const ensure = (overrides: Partial<Parameters<typeof ensureDashboard>[0]> = {}) =>
  ensureDashboard({ pluginRoot, buildId: "1.0.0", port, paths, ...overrides });

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "sugo-dash-home-"));
  pluginRoot = mkdtempSync(join(tmpdir(), "sugo-dash-plugin-"));
  mkdirSync(join(pluginRoot, "dashboard-runtime"));
  copyFileSync(join(__dirname, "fixtures", "fakeDashboardServer.mjs"), join(pluginRoot, "dashboard-runtime", "server.mjs"));
  process.env.SUGO_HOME_OVERRIDE = home;
  paths = dashboardPaths(home);
  port = await freePort();
});

afterEach(async () => {
  await stopDashboard(paths);
  await new Promise<void>((resolve) => (foreign ? foreign.close(() => resolve()) : resolve()));
  foreign = null;
  delete process.env.SUGO_HOME_OVERRIDE;
  delete process.env.FAKE_FAIL;
  rmSync(home, { recursive: true, force: true });
  rmSync(pluginRoot, { recursive: true, force: true });
});

describe("Node 버전 검사", () => {
  it("22.5 이상만 지원한다", () => {
    expect(["22.5.0", "22.12.1", "23.0.0", "26.8.1"].map((v) => isSupportedNode(v))).toEqual([true, true, true, true]);
    expect(["22.4.9", "20.19.0", "18.0.0"].map((v) => isSupportedNode(v))).toEqual([false, false, false]);
  });
});

describe("세션 시작 때 대시보드 실행", () => {
  it("처음에는 서버를 띄우고 주소를 알린다", async () => {
    const result = await ensure();

    expect(result).toEqual({ kind: "started", message: `Sugo 대시보드를 시작했다: http://sugo.localhost:${port}` });
    expect((await fetchHealth(port))?.build).toBe("1.0.0");
    expect((await readServerState(paths))?.port).toBe(port);
  });

  it("이미 떠 있으면 다시 띄우지 않는다", async () => {
    await ensure();
    const pid = (await readServerState(paths))?.pid;

    expect(await ensure()).toEqual({ kind: "running" });
    expect((await readServerState(paths))?.pid).toBe(pid);
  });

  it("여러 세션이 동시에 열려도 서버는 하나다", async () => {
    await Promise.all([ensure(), ensure(), ensure()]);

    const state = await readServerState(paths);
    expect(state).not.toBeNull();
    expect((await fetchHealth(port))?.status).toBe("ok");
    expect(await ensure()).toEqual({ kind: "running" });
    expect((await readServerState(paths))?.pid).toBe(state?.pid);
  });

  it("플러그인 버전이 바뀌면 새 버전 서버로 교체한다", async () => {
    await ensure();
    const oldPid = (await readServerState(paths))?.pid;

    const result = await ensure({ buildId: "2.0.0" });

    expect(result.kind).toBe("started");
    expect((await fetchHealth(port))?.build).toBe("2.0.0");
    expect((await readServerState(paths))?.pid).not.toBe(oldPid);
  });

  it("우리가 띄우지 않은 Sugo Console(개발용 등)이 응답 중이면 건드리지 않는다", async () => {
    foreign = createServer((_req, res) => res.end(JSON.stringify({ status: "ok", service: "sugo-console", version: "0.26.9", build: "dev" })));
    await new Promise<void>((resolve) => foreign!.listen(port, "127.0.0.1", resolve));

    expect(await ensure()).toEqual({ kind: "running" });
    expect((await fetchHealth(port))?.build).toBe("dev");
    expect(await readServerState(paths)).toBeNull();
  });

  it("다른 앱이 포트를 쓰고 있으면 health가 ok여도 Console로 보지 않고 다음 빈 포트로 띄운다", async () => {
    foreign = createServer((_req, res) => res.end(JSON.stringify({ status: "ok", version: "9.9.9", build: "other" })));
    await new Promise<void>((resolve) => foreign!.listen(port, "127.0.0.1", resolve));

    const result = await ensure();
    const state = await readServerState(paths);

    expect(result.kind).toBe("started");
    expect(state?.port).toBeGreaterThan(port);
    expect(result).toHaveProperty("message", expect.stringContaining(`http://sugo.localhost:${state?.port}`));
    expect((await fetchHealth(state!.port))?.build).toBe("1.0.0");
    expect((await controlDashboard("status", { pluginRoot, buildId: "1.0.0", port, paths })).url).toBe(`http://sugo.localhost:${state?.port}`);
  });

  it("사용자가 고정한 포트가 쓰이고 있으면 다른 포트로 옮기지 않고 이유를 알린다", async () => {
    foreign = createServer((_req, res) => res.end("busy"));
    await new Promise<void>((resolve) => foreign!.listen(port, "127.0.0.1", resolve));
    mkdirSync(paths.sugoDir, { recursive: true });
    writeFileSync(paths.settingsFile, JSON.stringify({ dashboard: { port } }));

    const result = await ensureDashboard({ pluginRoot, buildId: "1.0.0", paths });

    expect(result).toMatchObject({ kind: "failed" });
    expect(result).toHaveProperty("message", expect.stringContaining("dashboard.port"));
    expect(await readServerState(paths)).toBeNull();
  });

  it("죽은 서버의 상태 파일은 치우고 새로 띄운다", async () => {
    mkdirSync(paths.dataDir, { recursive: true });
    writeFileSync(paths.stateFile, JSON.stringify({ pid: 2 ** 22 + 1, port, startedAt: "2026-01-01T00:00:00Z" }));

    expect((await ensure()).kind).toBe("started");
    expect((await readServerState(paths))?.pid).not.toBe(2 ** 22 + 1);
  });
});

describe("실행하지 않는 경우", () => {
  it("사용자가 dashboard.enabled를 false로 두면 띄우지 않는다", async () => {
    mkdirSync(paths.sugoDir, { recursive: true });
    writeFileSync(paths.settingsFile, JSON.stringify({ dashboard: { enabled: false } }));

    expect(await ensure()).toEqual({ kind: "skipped", reason: "opt-out" });
    expect(await fetchHealth(port)).toBeNull();
  });

  it("Node가 22.5보다 낮으면 설치를 안내하고 띄우지 않는다", async () => {
    const result = await ensure({ nodeVersion: "20.11.0" });

    expect(result).toMatchObject({ kind: "skipped", reason: "node-too-old" });
    expect(result).toHaveProperty("message", expect.stringContaining("Node 22.5 이상"));
    expect(await fetchHealth(port)).toBeNull();
  });

  it("서버 번들이 없으면 조용히 건너뛴다", async () => {
    rmSync(join(pluginRoot, "dashboard-runtime"), { recursive: true });

    expect(await ensure()).toEqual({ kind: "skipped", reason: "no-runtime" });
  });

  it("서버가 시작에 실패하면 로그 위치를 알리고 던지지 않는다", async () => {
    process.env.FAKE_FAIL = "1";

    const result = await ensure();

    expect(result).toMatchObject({ kind: "failed" });
    expect(result).toHaveProperty("message", expect.stringContaining(paths.logFile));
    expect(readFileSync(paths.logFile, "utf8")).toContain("fake start failure");
  });
});

describe("서버 정지", () => {
  it("실행 중인 서버를 멈추고 상태 파일을 지운다", async () => {
    await ensure();

    expect(await stopDashboard(paths)).toEqual({ stopped: true, unverified: false });
    expect(await fetchHealth(port)).toBeNull();
    expect(await readServerState(paths)).toBeNull();
  });

  it("기록이 없으면 멈출 것이 없다", async () => {
    expect(await stopDashboard(paths)).toEqual({ stopped: true, unverified: false });
  });

  it("PID가 살아 있어도 대시보드 응답이 없으면 종료 신호를 보내지 않는다", async () => {
    mkdirSync(paths.dataDir, { recursive: true });
    writeFileSync(paths.stateFile, JSON.stringify({ pid: process.pid, port, startedAt: "2026-01-01T00:00:00Z" }));

    expect(await stopDashboard(paths)).toEqual({ stopped: false, unverified: true });
  });
});

describe("사용자 Console 관리", () => {
  it("상태 확인은 서버를 시작하지 않고 고정 주소와 실행 여부를 알려준다", async () => {
    expect(await controlDashboard("status", { pluginRoot, buildId: "1.0.0", port, paths })).toEqual({
      action: "status",
      running: false,
      managed: false,
      url: `http://sugo.localhost:${port}`,
    });
    expect(await fetchHealth(port)).toBeNull();
  });

  it("start, restart, stop을 사용자가 명시적으로 제어한다", async () => {
    const started = await controlDashboard("start", { pluginRoot, buildId: "1.0.0", port, paths });
    const firstPid = (await readServerState(paths))?.pid;
    expect(started).toMatchObject({ action: "start", running: true, managed: true, build: "1.0.0" });

    const restarted = await controlDashboard("restart", { pluginRoot, buildId: "1.0.0", port, paths });
    expect(restarted).toMatchObject({ action: "restart", running: true, managed: true, build: "1.0.0" });
    expect((await readServerState(paths))?.pid).not.toBe(firstPid);

    expect(await controlDashboard("stop", { pluginRoot, buildId: "1.0.0", port, paths })).toEqual({
      action: "stop",
      running: false,
      managed: false,
      url: `http://sugo.localhost:${port}`,
    });
  });
});

describe("브라우저로 열기", () => {
  it("open은 Console을 띄운 뒤 결과 주소를 브라우저로 연다", async () => {
    const opened: string[] = [];
    const result = await controlDashboard("open", { pluginRoot, buildId: "1.0.0", port, paths, openUrl: async (url) => (opened.push(url), true) });

    expect(result).toMatchObject({ action: "open", running: true, url: `http://sugo.localhost:${port}` });
    expect(opened).toEqual([`http://sugo.localhost:${port}`]);
  });

  it("브라우저를 열지 못하면 주소를 직접 열도록 알린다", async () => {
    const result = await controlDashboard("open", { pluginRoot, buildId: "1.0.0", port, paths, openUrl: async () => false });

    expect(result.message).toContain(`http://sugo.localhost:${port}`);
  });

  it("플랫폼마다 기본 브라우저 실행 명령이 다르다", () => {
    const url = "http://sugo.localhost:3001";
    expect(browserCommand(url, "darwin")).toEqual({ command: "open", args: [url] });
    expect(browserCommand(url, "win32")).toEqual({ command: "cmd", args: ["/c", "start", "", url] });
    expect(browserCommand(url, "linux")).toEqual({ command: "xdg-open", args: [url] });
  });
});

describe("배포물 정합성", () => {
  const root = join(__dirname, "..");
  const consolePackage = join(root, "..", "dashboard", "backend", "package.json");

  it("세션을 열 때 Console을 띄우지 않는다(open, start, 사람 판단 대기 때만 띄운다)", () => {
    const hooks = JSON.parse(readFileSync(join(root, "hooks", "hooks.json"), "utf8"));
    const commands: string[] = hooks.hooks.SessionStart.flatMap((entry: { hooks: { command: string }[] }) => entry.hooks.map((hook) => hook.command));

    expect(commands.some((command) => command.includes("dashboard-start"))).toBe(false);
    expect(readFileSync(join(root, "src", "tools", "sugoRoadmap.ts"), "utf8").match(/controlConsole\("start"\)/g)).toHaveLength(2);
  });

  it("사용자가 Console을 직접 관리하는 명령과 도구를 배포한다", () => {
    expect(existsSync(join(root, "commands", "console.md"))).toBe(true);
    const command = readFileSync(join(root, "commands", "console.md"), "utf8");
    expect(command).toContain("sugo_console");
    expect(readFileSync(join(root, "src", "index.ts"), "utf8")).toContain('"sugo_console"');
  });

  it("Console 시작 진입점은 Dashboard가 준비되면 로컬 파일 정본을 자동 동기화한다", () => {
    const source = readFileSync(join(root, "src", "lifecycle", "dashboardStartHook.ts"), "utf8");
    expect(source).toContain('import { syncAllWorkspaceData } from "../dashboard/syncAll.js"');
    expect(source).toContain('result.kind === "started" || result.kind === "running"');
    expect(source).toContain("await syncAllWorkspaceData()");
  });

  it("서버 번들과 프론트 정적 파일이 플러그인에 실려 있다", () => {
    expect(existsSync(join(root, "dashboard-runtime", "server.mjs"))).toBe(true);
    expect(existsSync(join(root, "dashboard-runtime", "web", "index.html"))).toBe(true);
  });

  it.skipIf(!existsSync(consolePackage))("번들한 Console 버전이 dashboard 패키지 버전과 같다(Console 버전을 올렸으면 다시 번들한다)", () => {
    const bundled = JSON.parse(readFileSync(join(root, "dashboard-runtime", "runtime.json"), "utf8"));
    const current = JSON.parse(readFileSync(consolePackage, "utf8"));

    expect(bundled.consoleVersion).toBe(current.version);
  });
});
