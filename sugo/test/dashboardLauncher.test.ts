import { createServer, type Server } from "node:http";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
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

    expect(result).toEqual({ kind: "started", message: `Sugo 대시보드를 시작했다: http://localhost:${port}` });
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

  it("우리가 띄우지 않은 대시보드가 응답 중이면 건드리지 않는다", async () => {
    foreign = createServer((_req, res) => res.end(JSON.stringify({ status: "ok", version: "0.26.9", build: "dev" })));
    await new Promise<void>((resolve) => foreign!.listen(port, "127.0.0.1", resolve));

    expect(await ensure()).toEqual({ kind: "running" });
    expect((await fetchHealth(port))?.build).toBe("dev");
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

describe("배포물 정합성", () => {
  const root = join(__dirname, "..");
  const consolePackage = join(root, "..", "dashboard", "backend", "package.json");

  it("SessionStart 훅이 번들된 시작 스크립트를 가리키고 그 파일이 있다", () => {
    const hooks = JSON.parse(readFileSync(join(root, "hooks", "hooks.json"), "utf8"));
    const command: string = hooks.hooks.SessionStart[0].hooks[0].command;

    expect(command).toContain("${CLAUDE_PLUGIN_ROOT}/dist/dashboard-start.mjs");
    expect(existsSync(join(root, "dist", "dashboard-start.mjs"))).toBe(true);
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
