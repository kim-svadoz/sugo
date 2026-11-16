import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WEEKLY_MAX_ATTEMPTS, createWeeklyScheduleTick, findWeeklyEngine, latestWeeklySlot, weeklyLabelForRun, weeklyRetryDelayMs, weeklySlotsSince } from "../src/services/weeklyScheduleService.js";
import { createWeeklySettingsService } from "../src/services/weeklySettingsService.js";

const schedule = { enabled: true, weekday: 5, hour: 17, minute: 0 };
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe("weekly schedule", () => {
  it("가장 최근의 예약 시점을 현지 시각으로 찾는다", () => {
    expect(latestWeeklySlot(local(2026, 10, 23, 17, 0), schedule)).toEqual(local(2026, 10, 23, 17, 0));
    expect(latestWeeklySlot(local(2026, 10, 23, 16, 59), schedule)).toEqual(local(2026, 10, 16, 17, 0));
    expect(latestWeeklySlot(local(2026, 10, 26, 9, 0), schedule)).toEqual(local(2026, 10, 23, 17, 0));
    expect(latestWeeklySlot(local(2026, 10, 25, 8, 0), { ...schedule, weekday: 0, hour: 8 })).toEqual(local(2026, 10, 25, 8, 0));
  });

  it("실행 시각으로 엔진과 같은 주를 고른다(금~일은 그 주, 월~목은 지난주)", () => {
    const cases: [Date, string][] = [
      [local(2026, 11, 14, 8), "2026-W46"], [local(2026, 11, 16, 9), "2026-W46"], [local(2026, 11, 13, 17), "2026-W46"], [local(2026, 11, 20, 8), "2026-W47"],
      [local(2027, 1, 4, 9), "2026-W53"], [local(2027, 1, 1, 8), "2026-W53"], [local(2026, 1, 1, 8), "2025-W52"], [local(2026, 1, 5, 8), "2026-W01"],
    ];
    expect(cases.map(([at]) => weeklyLabelForRun(at))).toEqual(cases.map(([, label]) => label));
  });

  it("처리 기록 이후 지난 예약 시점을 오래된 것부터 모두 찾는다", () => {
    const saturday = { weekday: 6, hour: 8, minute: 0 };
    expect(weeklySlotsSince(local(2026, 10, 31, 8).toISOString(), local(2026, 11, 16, 9), saturday)).toEqual([local(2026, 11, 7, 8).toISOString(), local(2026, 11, 14, 8).toISOString()]);
    expect(weeklySlotsSince(local(2026, 11, 14, 8).toISOString(), local(2026, 11, 16, 9), saturday)).toEqual([]);
  });
});

describe("weekly schedule tick", () => {
  const saturday = { enabled: true, weekday: 6, hour: 8, minute: 0 };
  let home: string;
  let now: Date;
  let builds: string[];
  let fail: string | null;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "sugo-weekly-schedule-"));
    writeFileSync(join(home, "config.json"), JSON.stringify({ schedule: saturday }));
    builds = [];
    fail = null;
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  const tick = () => createWeeklyScheduleTick({
    weeklyHome: home,
    now: () => now,
    engine: async () => "/engine",
    build: async (_engine, week) => {
      builds.push(week);
      if (fail) throw new Error(`Command failed: run.mjs build --week ${week}\nRuntimeError: ${fail}`);
      mkdirSync(join(home, "reports"), { recursive: true });
      writeFileSync(join(home, "reports", `${week}.html`), "report");
      return { stdout: "ok", stderr: "" };
    },
  })();
  const handle = (at: Date) => writeFileSync(join(home, "last-scheduled-slot"), `${at.toISOString()}\n`);
  const failures = async () => (await createWeeklySettingsService({ weeklyHome: home, findEngine: async () => "/engine" }).get()).scheduleFailures;

  it("처음 켜면 지난 시점을 만들지 않고 기록만 한다", async () => {
    now = local(2026, 11, 16, 9);
    await tick();
    expect(builds).toEqual([]);
    expect(readFileSync(join(home, "last-scheduled-slot"), "utf8").trim()).toBe(local(2026, 11, 14, 8).toISOString());
  });

  it("예약 시점이 지나면 그 주를 --week로 한 번 만든다", async () => {
    handle(local(2026, 11, 7, 8));
    writeFileSync(join(home, "scheduled-runs.json"), JSON.stringify({ pending: [], failed: [] }));
    now = local(2026, 11, 14, 8, 1);
    await tick();
    await tick();
    expect(builds).toEqual(["2026-W46"]);
  });

  it("실패한 주는 기다렸다가 다시 시도하고, 성공하면 알림이 사라진다", async () => {
    handle(local(2026, 11, 7, 8));
    writeFileSync(join(home, "scheduled-runs.json"), JSON.stringify({ pending: [], failed: [] }));
    now = local(2026, 11, 14, 8, 1);
    fail = "claude 실행 실패";
    await tick();
    expect(await failures()).toEqual([{ week: "2026-W46", attempts: 1, lastError: expect.stringContaining("claude 실행 실패"), retrying: true }]);
    now = new Date(now.getTime() + weeklyRetryDelayMs(1) - 60_000);
    await tick();
    expect(builds).toEqual(["2026-W46"]);
    fail = null;
    now = new Date(now.getTime() + 60_000);
    await tick();
    expect(builds).toEqual(["2026-W46", "2026-W46"]);
    expect(await failures()).toEqual([]);
  });

  it("엔진을 찾지 못해도 그 주를 버리지 않고 다시 시도한다", async () => {
    handle(local(2026, 11, 7, 8));
    writeFileSync(join(home, "scheduled-runs.json"), JSON.stringify({ pending: [], failed: [] }));
    now = local(2026, 11, 14, 8, 1);
    await createWeeklyScheduleTick({ weeklyHome: home, now: () => now, engine: async () => null })();
    expect(await failures()).toEqual([{ week: "2026-W46", attempts: 1, lastError: "weekly engine not found", retrying: true }]);
  });

  it(`${WEEKLY_MAX_ATTEMPTS}번 실패하면 다시 시도를 멈추고, 직접 만든 보고서가 생기면 알림을 지운다`, async () => {
    handle(local(2026, 11, 7, 8));
    writeFileSync(join(home, "scheduled-runs.json"), JSON.stringify({ pending: [], failed: [] }));
    now = local(2026, 11, 14, 8, 1);
    fail = "claude 실행 실패";
    for (let attempt = 1; attempt <= WEEKLY_MAX_ATTEMPTS + 2; attempt += 1) {
      await tick();
      now = new Date(now.getTime() + weeklyRetryDelayMs(attempt));
    }
    expect(builds).toHaveLength(WEEKLY_MAX_ATTEMPTS);
    expect(await failures()).toEqual([{ week: "2026-W46", attempts: WEEKLY_MAX_ATTEMPTS, lastError: expect.any(String), retrying: false }]);
    mkdirSync(join(home, "reports"), { recursive: true });
    writeFileSync(join(home, "reports", "2026-W46.html"), "manual");
    expect(await failures()).toEqual([]);
  });

  it("Console이 몇 주 꺼져 있었으면 밀린 주를 오래된 것부터 모두 만든다", async () => {
    handle(local(2026, 10, 24, 8));
    writeFileSync(join(home, "scheduled-runs.json"), JSON.stringify({ pending: [], failed: [] }));
    now = local(2026, 11, 16, 9);
    for (let index = 0; index < 4; index += 1) await tick();
    expect(builds).toEqual(["2026-W44", "2026-W45", "2026-W46"]);
  });

  it("따라잡기가 다음 주 금요일에 돌아도 놓친 예약 시점의 주를 만든다", async () => {
    handle(local(2026, 11, 7, 8));
    writeFileSync(join(home, "scheduled-runs.json"), JSON.stringify({ pending: [], failed: [] }));
    now = local(2026, 11, 20, 18);
    await tick();
    expect(builds).toEqual(["2026-W46"]);
  });

  it("예전 버전이 처리했다고만 기록하고 보고서를 만들지 못한 주를 한 번 되살린다", async () => {
    handle(local(2026, 11, 14, 8));
    now = local(2026, 11, 16, 9);
    await tick();
    await tick();
    expect(builds).toEqual(["2026-W46"]);
  });

  it("예전 버전이 이미 만든 주는 다시 만들지 않는다", async () => {
    handle(local(2026, 11, 14, 8));
    mkdirSync(join(home, "reports"), { recursive: true });
    writeFileSync(join(home, "reports", "2026-W46.html"), "report");
    now = local(2026, 11, 16, 9);
    await tick();
    expect(builds).toEqual([]);
  });

  it("예약을 끄면 대기 중인 주도 만들지 않는다", async () => {
    handle(local(2026, 11, 7, 8));
    writeFileSync(join(home, "config.json"), JSON.stringify({ schedule: { ...saturday, enabled: false } }));
    now = local(2026, 11, 14, 8, 1);
    await tick();
    expect(builds).toEqual([]);
  });
});

describe("weekly engine lookup", () => {
  const saved = { home: process.env.SUGO_HOME_OVERRIDE, engine: process.env.SUGO_WEEKLY_ENGINE };
  afterEach(() => {
    if (saved.home === undefined) delete process.env.SUGO_HOME_OVERRIDE; else process.env.SUGO_HOME_OVERRIDE = saved.home;
    if (saved.engine === undefined) delete process.env.SUGO_WEEKLY_ENGINE; else process.env.SUGO_WEEKLY_ENGINE = saved.engine;
  });

  it("Launcher가 넘긴 경로가 없으면 설치된 Plugin의 엔진을 쓴다", async () => {
    const home = mkdtempSync(join(tmpdir(), "sugo-weekly-home-"));
    const installPath = join(home, ".claude", "plugins", "cache", "sugo-marketplace", "sugo", "9.9.9");
    mkdirSync(join(installPath, "weekly"), { recursive: true });
    writeFileSync(join(installPath, "weekly", "run.mjs"), "");
    writeFileSync(join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify({ plugins: { "sugo@sugo-marketplace": [{ installPath }] } }));
    process.env.SUGO_HOME_OVERRIDE = home;
    process.env.SUGO_WEEKLY_ENGINE = join(home, "runtime", "weekly");
    try {
      expect(await findWeeklyEngine()).toBe(join(installPath, "weekly"));
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
