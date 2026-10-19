import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
import { addTask } from "../src/work/task.js";

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

/** 액션이 어느 도구에 속하는지를 고정한다 — health/judgment는 `sugo_status`, 워크스페이스 status/sync는 `sugo_workspace`. */
describe("isWorkEnabled — 상수", () => {
  it("항상 true다", () => {
    expect(isWorkEnabled()).toBe(true);
  });

  it("sugo_status가 그 값을 그대로 노출한다", async () => {
    const r = await call(handleSugoStatus, {});
    expect(r.data.workEnabled).toBe(true);
  });
});

describe("sugo_workspace(status)", () => {
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
    // status 동기화가 task 노드에 Spec→Run 부모를 자동 보강한다.
    expect(status.data.roadmapNodeCount).toBe(4);
    expect(status.data.specCount).toBe(1);
    expect(status.data.historyCount).toBe(0);
  });

  it("name 없이 호출하면 거부한다", async () => {
    const result = await call(handleSugoWorkspace, { action: "status" });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("NAME_REQUIRED");
  });

  it("work-result 경로가 빠진 완료 작업은 status에서 patch 진입점을 자동 복구한다", async () => {
    const featureDir = join(fakeHome, "project", "sugo", "features", "20261016", "completed");
    mkdirSync(featureDir, { recursive: true });
    const prdPath = join(featureDir, "prd.md");
    writeFileSync(prdPath, "# PRD\n");
    await call(handleSugoWorkspace, { action: "add", name: "ws1", projectPath: join(fakeHome, "project") });
    await addTask("ws1", { title: "완료 작업", project: join(fakeHome, "project"), status: "done", prd_ref: prdPath });

    const status = await call(handleSugoWorkspace, { action: "status", name: "ws1" });
    const taskNode = status.data.roadmapNodes.find((node: { level: string }) => node.level === "task");
    expect(taskNode.workResult.path).toBe(join(featureDir, "work-result.md"));
    expect(existsSync(taskNode.workResult.path)).toBe(true);
  });
});

describe("sugo_workspace(sync)", () => {
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

describe("sugo_status(health)", () => {
  it("health:true면 대시보드 설정과 재시도 큐 크기를 함께 준다", async () => {
    const result = await call(handleSugoStatus, { health: true });
    expect(result.isError).toBe(false);
    expect(result.data.health.dashboardEnabled).toBe(false);
    expect(result.data.health.retryQueueSize).toBe(0);
  });

  it("health를 안 주면 진단 블록이 아예 없다(기본은 프로젝트 목록)", async () => {
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

describe("sugo_status(judgment)", () => {
  it("세션이 없으면 totalSessions:0인 리포트를 준다", async () => {
    const result = await call(handleSugoStatus, { judgment: true });
    expect(result.isError).toBe(false);
    expect(result.data.judgment.totalSessions).toBe(0);
  });

  it("days로 필터링할 수 있다", async () => {
    const result = await call(handleSugoStatus, { judgment: true, days: 7 });
    expect(result.isError).toBe(false);
    expect(result.data.judgment).toBeDefined();
  });
});
