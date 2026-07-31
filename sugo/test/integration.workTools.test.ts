import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoCheckpoint } from "../src/tools/sugoCheckpoint.js";
import { handleSugoRoadmap } from "../src/tools/sugoRoadmap.js";
import { handleSugoSpec } from "../src/tools/sugoSpec.js";
import { handleSugoStatus } from "../src/tools/sugoStatus.js";
import { handleSugoTask } from "../src/tools/sugoTask.js";
import { handleSugoWorkspace } from "../src/tools/sugoWorkspace.js";
import { isWorkEnabled } from "../src/work/enabled.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(handler: (args: unknown) => Promise<any>, args?: unknown) {
  const res = await handler(args);
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

let fakeHome: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-work-tool-home-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
});

/**
 * §9/§1 v2 도구 델타: `sugo_hulk` umbrella 완전 제거. 이 파일은 그 도구가 갖고 있던 액션들이
 * 어디로 갔는지를 고정한다 — health/judgment는 `sugo_status`로, 워크스페이스 status/sync는
 * `sugo_workspace`로. enable/disable/help는 그냥 사라졌다(토글은 무력한 no-op이었고,
 * help는 도구 description이 할 일이다).
 */
describe("§9 isWorkEnabled — 상수, 토글 개념 소멸", () => {
  it("항상 true다", () => {
    expect(isWorkEnabled()).toBe(true);
  });

  it("sugo_status가 그 값을 그대로 노출한다", async () => {
    const r = await call(handleSugoStatus, {});
    expect(r.data.workEnabled).toBe(true);
  });
});

describe("sugo_workspace(status) — 구 sugo_hulk(status) 흡수", () => {
  it("워크스페이스의 task/checkpoint/roadmap/spec/history 개수를 모아 보여준다", async () => {
    await call(handleSugoWorkspace, { action: "add", name: "ws1", projectPath: "/tmp/p" });
    await call(handleSugoTask, { action: "add", workspace: "ws1", title: "T1", project: "/tmp/p" });
    await call(handleSugoCheckpoint, { action: "add", workspace: "ws1", title: "CP1", checklist: ["a"] });
    await call(handleSugoRoadmap, { action: "add", workspace: "ws1", id: "R1", title: "R1", level: "task" });
    await call(handleSugoSpec, { action: "add", workspace: "ws1", name: "S1", type: "architecture", content: "x" });

    const status = await call(handleSugoWorkspace, { action: "status", name: "ws1" });
    expect(status.isError).toBe(false);
    expect(status.data.taskCount).toBe(1);
    expect(status.data.checkpointCount).toBe(1);
    expect(status.data.roadmapNodeCount).toBe(1);
    expect(status.data.specCount).toBe(1);
    expect(status.data.historyCount).toBe(0);
  });

  it("name 없이 호출하면 거부한다", async () => {
    const result = await call(handleSugoWorkspace, { action: "status" });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("NAME_REQUIRED");
  });
});

describe("sugo_workspace(sync) — 구 sugo_hulk(sync) 흡수", () => {
  it("워크스페이스 전체(workspace/task/roadmap)를 다시 push한다(대시보드 disabled면 조용히 통과)", async () => {
    await call(handleSugoWorkspace, { action: "add", name: "ws1", projectPath: "/tmp/p" });
    await call(handleSugoTask, { action: "add", workspace: "ws1", title: "T1", project: "/tmp/p" });
    const result = await call(handleSugoWorkspace, { action: "sync", name: "ws1" });
    expect(result.isError).toBe(false);
    expect(result.data.taskCount).toBe(1);
  });

  it("name 없이 호출하면 거부한다", async () => {
    const result = await call(handleSugoWorkspace, { action: "sync" });
    expect(result.isError).toBe(true);
  });
});

describe("sugo_status(health) — 구 sugo_hulk(health) 흡수", () => {
  it("health:true면 대시보드 설정과 재시도 큐 크기를 함께 준다", async () => {
    const result = await call(handleSugoStatus, { health: true });
    expect(result.isError).toBe(false);
    expect(result.data.health.dashboardEnabled).toBe(false);
    expect(result.data.health.retryQueueSize).toBe(0);
  });

  it("health를 안 주면 진단 블록이 아예 없다(기본은 v1과 동일한 프로젝트 목록)", async () => {
    const result = await call(handleSugoStatus, {});
    expect(result.data.health).toBeUndefined();
    expect(result.data.judgment).toBeUndefined();
    expect(Array.isArray(result.data.projects)).toBe(true);
  });

  it("인자 없이 호출해도 동작한다(하위호환)", async () => {
    const result = await call(handleSugoStatus);
    expect(result.isError).toBe(false);
    expect(result.data.totalProjects).toBe(0);
  });
});

describe("sugo_status(judgment) — 구 sugo_hulk(judgment) 흡수", () => {
  it("세션이 없으면 totalSessions:0인 리포트를 준다", async () => {
    const result = await call(handleSugoStatus, { judgment: true });
    expect(result.isError).toBe(false);
    expect(result.data.judgment.totalSessions).toBe(0);
  });

  it("days로 필터링할 수 있다(구 windowDays)", async () => {
    const result = await call(handleSugoStatus, { judgment: true, days: 7 });
    expect(result.isError).toBe(false);
    expect(result.data.judgment).toBeDefined();
  });
});
