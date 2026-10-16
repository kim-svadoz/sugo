import { spawn } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { uninstallSugo } from "../src/tools/sugoUninstall.js";
import { dashboardPaths, ensureDashboard, fetchHealth, readServerState, stopDashboard, type DashboardPaths } from "../src/lifecycle/dashboardRuntime.js";
import { freePort } from "./fixtures/freePort.js";

let home: string;
let pluginRoot: string;
let paths: DashboardPaths;
let port: number;

const deps = () => ({ pluginRoot, buildId: "1.0.0", port });
const run = async (args: Record<string, unknown>) => {
  const res = await uninstallSugo(args, deps());
  return { isError: Boolean(res.isError), data: JSON.parse(res.content[0].text) };
};
const startDashboard = () => ensureDashboard({ pluginRoot, buildId: "1.0.0", port, paths });
const retain = () => run({ action: "execute", mode: "retain", confirmation: "UNINSTALL_SUGO" });

beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "sugo-dash-life-home-"));
  pluginRoot = mkdtempSync(join(tmpdir(), "sugo-dash-life-plugin-"));
  mkdirSync(join(pluginRoot, "dashboard-runtime"));
  copyFileSync(join(__dirname, "fixtures", "fakeDashboardServer.mjs"), join(pluginRoot, "dashboard-runtime", "server.mjs"));
  process.env.SUGO_HOME_OVERRIDE = home;
  paths = dashboardPaths(home);
  port = await freePort();
  mkdirSync(paths.dataDir, { recursive: true });
  writeFileSync(join(paths.sugoDir, "registry.json"), "[]");
  writeFileSync(join(paths.dataDir, "dashboard.db"), "db-contents");
});

afterEach(async () => {
  await stopDashboard(paths);
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(home, { recursive: true, force: true });
  rmSync(pluginRoot, { recursive: true, force: true });
});

describe("uninstall(retain)", () => {
  it("실행 중인 서버를 멈추고 대시보드 데이터를 비활성 보관한다", async () => {
    await startDashboard();
    expect(await fetchHealth(port)).not.toBeNull();

    const { data } = await retain();

    expect(data).toMatchObject({ ok: true, mode: "retain", verifiedClean: true });
    expect(await fetchHealth(port)).toBeNull();
    expect(existsSync(paths.sugoDir)).toBe(false);
    const archived = join(home, ".sugo", "data", "dashboard");
    expect(readFileSync(join(archived, "dashboard.db"), "utf8")).toBe("db-contents");
    expect(existsSync(join(archived, "server.json"))).toBe(false);
  });

  it("서버가 없어도 기존처럼 보관한다", async () => {
    const { data } = await retain();

    expect(data).toMatchObject({ ok: true, verifiedClean: true });
    expect(existsSync(join(home, ".sugo", "data", "dashboard", "dashboard.db"))).toBe(true);
  });

  it("서버를 멈출 수 없으면 아무것도 옮기지 않는다", async () => {
    writeFileSync(paths.stateFile, JSON.stringify({ pid: process.pid, port, startedAt: "2026-01-01T00:00:00Z" }));

    const { isError, data } = await retain();

    expect(isError).toBe(true);
    expect(data.errorCode).toBe("DASHBOARD_STILL_RUNNING");
    expect(readFileSync(join(paths.dataDir, "dashboard.db"), "utf8")).toBe("db-contents");
    expect(existsSync(join(home, ".sugo", "data"))).toBe(false);
  });

  it("preview는 서버 실행 여부를 알린다", async () => {
    expect((await run({ action: "preview", mode: "retain" })).data.dashboardRunning).toBe(false);

    await startDashboard();

    expect((await run({ action: "preview", mode: "retain" })).data.dashboardRunning).toBe(true);
  });
});

describe("uninstall(purge)", () => {
  it("서버를 멈추고 활성·보관 데이터를 모두 지운다", async () => {
    await startDashboard();

    const { data } = await run({ action: "execute", mode: "purge", confirmation: "DELETE_SUGO_DATA" });

    expect(data).toMatchObject({ ok: true, mode: "purge", verifiedClean: true });
    expect(await fetchHealth(port)).toBeNull();
    expect(existsSync(paths.sugoDir)).toBe(false);
    expect(existsSync(join(home, ".sugo"))).toBe(false);
  });
});

describe("restore", () => {
  it("보관한 데이터를 되살리고 대시보드를 다시 띄운다", async () => {
    await startDashboard();
    await retain();

    const { data } = await run({ action: "restore" });

    expect(data).toMatchObject({ ok: true, active: true, dashboard: "started" });
    expect(readFileSync(join(paths.dataDir, "dashboard.db"), "utf8")).toBe("db-contents");
    expect(await fetchHealth(port)).not.toBeNull();
    expect((await readServerState(paths))?.pid).toBeTypeOf("number");
  });

  it("재설치 뒤 새로 뜬 서버가 있으면 멈추고 보관 데이터로 교체한다", async () => {
    await retain();
    mkdirSync(paths.dataDir, { recursive: true });
    writeFileSync(join(paths.dataDir, "fresh-install.db"), "new");
    await startDashboard();
    const freshPid = (await readServerState(paths))?.pid;

    await run({ action: "restore" });

    expect(existsSync(join(paths.dataDir, "fresh-install.db"))).toBe(false);
    expect(readFileSync(join(paths.dataDir, "dashboard.db"), "utf8")).toBe("db-contents");
    expect(await fetchHealth(port)).not.toBeNull();
    expect((await readServerState(paths))?.pid).not.toBe(freshPid);
  });

  it("보관 데이터가 없으면 서버를 건드리지 않는다", async () => {
    await startDashboard();

    const { isError, data } = await run({ action: "restore" });

    expect(isError).toBe(true);
    expect(data.errorCode).toBe("NO_RETAINED_DATA");
    expect(await fetchHealth(port)).not.toBeNull();
  });
});

describe("독립 제거기(플러그인 캐시가 없을 때)", () => {
  const standalone = join(__dirname, "..", "scripts", "sugo-uninstall-standalone.mjs");
  const runStandalone = (mode: string) =>
    new Promise<{ code: number | null; stderr: string }>((resolve) => {
      const child = spawn(process.execPath, [standalone, mode], { env: { ...process.env, SUGO_HOME_OVERRIDE: home } });
      let stderr = "";
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("exit", (code) => resolve({ code, stderr }));
    });

  it("서버를 멈춘 뒤 데이터를 보관한다", async () => {
    await startDashboard();

    const { code } = await runStandalone("uninstall");

    expect(code).toBe(0);
    expect(await fetchHealth(port)).toBeNull();
    expect(readFileSync(join(home, ".sugo", "data", "dashboard", "dashboard.db"), "utf8")).toBe("db-contents");
  });

  it("서버를 확인할 수 없으면 아무것도 바꾸지 않고 실패한다", async () => {
    writeFileSync(paths.stateFile, JSON.stringify({ pid: process.pid, port, startedAt: "2026-01-01T00:00:00Z" }));

    const { code, stderr } = await runStandalone("purge");

    expect(code).toBe(1);
    expect(stderr).toContain("could not be verified");
    expect(readFileSync(join(paths.dataDir, "dashboard.db"), "utf8")).toBe("db-contents");
  });
});
