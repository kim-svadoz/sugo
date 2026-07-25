import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoCheckpoint } from "../src/tools/sugoCheckpoint.js";
import { handleSugoHulk } from "../src/tools/sugoHulk.js";
import { handleSugoRoadmap } from "../src/tools/sugoRoadmap.js";
import { handleSugoSpec } from "../src/tools/sugoSpec.js";
import { handleSugoTask } from "../src/tools/sugoTask.js";
import { handleSugoWorkspace } from "../src/tools/sugoWorkspace.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(handler: (args: unknown) => Promise<any>, args?: unknown) {
  const res = await handler(args);
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

let fakeHome: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-hulk-tool-home-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
});

describe("sugo_hulk(enable/disable) — 항상 켜짐, 토글은 no-op", () => {
  it("enable/disable 둘 다 성공하지만 실제로 아무 것도 바꾸지 않는다는 메시지를 반환한다", async () => {
    const enable = await call(handleSugoHulk, { action: "enable" });
    const disable = await call(handleSugoHulk, { action: "disable" });
    expect(enable.isError).toBe(false);
    expect(disable.isError).toBe(false);
    expect(enable.data.message).toContain("항상");
    expect(disable.data.message).toContain("항상");
  });
});

describe("sugo_hulk(help)", () => {
  it("도움말 텍스트를 반환한다", async () => {
    const result = await call(handleSugoHulk, { action: "help" });
    expect(result.isError).toBe(false);
    expect(typeof result.data.help).toBe("string");
    expect(result.data.help.length).toBeGreaterThan(0);
  });
});

describe("sugo_hulk(status)", () => {
  it("워크스페이스의 task/checkpoint/roadmap/spec/history 개수를 모아 보여준다", async () => {
    await call(handleSugoWorkspace, { action: "add", name: "ws1", projectPath: "/tmp/p" });
    await call(handleSugoTask, { action: "add", workspace: "ws1", title: "T1", project: "/tmp/p" });
    await call(handleSugoCheckpoint, { action: "add", workspace: "ws1", title: "CP1", checklist: ["a"] });
    await call(handleSugoRoadmap, { action: "add", workspace: "ws1", id: "R1", title: "R1", level: "task" });
    await call(handleSugoSpec, { action: "add", workspace: "ws1", name: "S1", type: "architecture", content: "x" });

    const status = await call(handleSugoHulk, { action: "status", workspace: "ws1" });
    expect(status.isError).toBe(false);
    expect(status.data.taskCount).toBe(1);
    expect(status.data.checkpointCount).toBe(1);
    expect(status.data.roadmapNodeCount).toBe(1);
    expect(status.data.specCount).toBe(1);
    expect(status.data.historyCount).toBe(0);
  });

  it("workspace 없이 호출하면 거부한다", async () => {
    const result = await call(handleSugoHulk, { action: "status" });
    expect(result.isError).toBe(true);
  });
});

describe("sugo_hulk(health)", () => {
  it("대시보드 설정과 재시도 큐 크기를 보여준다(disabled 기본)", async () => {
    const result = await call(handleSugoHulk, { action: "health" });
    expect(result.isError).toBe(false);
    expect(result.data.dashboardEnabled).toBe(false);
    expect(result.data.retryQueueSize).toBe(0);
  });
});

describe("sugo_hulk(sync)", () => {
  it("워크스페이스 전체(workspace/task/roadmap)를 다시 push한다(대시보드 disabled면 조용히 통과)", async () => {
    await call(handleSugoWorkspace, { action: "add", name: "ws1", projectPath: "/tmp/p" });
    await call(handleSugoTask, { action: "add", workspace: "ws1", title: "T1", project: "/tmp/p" });
    const result = await call(handleSugoHulk, { action: "sync", workspace: "ws1" });
    expect(result.isError).toBe(false);
    expect(result.data.taskCount).toBe(1);
  });
});

describe("sugo_hulk(judgment) — sugo_judgment_report 흡수", () => {
  it("세션이 없으면 totalSessions:0인 리포트를 반환한다", async () => {
    const result = await call(handleSugoHulk, { action: "judgment" });
    expect(result.isError).toBe(false);
    expect(result.data.report.totalSessions).toBe(0);
  });

  it("windowDays로 필터링할 수 있다", async () => {
    const result = await call(handleSugoHulk, { action: "judgment", windowDays: 7 });
    expect(result.isError).toBe(false);
    expect(result.data.report).toBeDefined();
  });
});
