import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addTask, findTaskByPrdRef, getTask, listTasks, updateTask } from "../src/hulk/task.js";
import { ensureWorkspace, listWorkspaces, loadWorkspace } from "../src/hulk/workspace.js";

let fakeHome: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-hulk-home-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
});

describe("ensureWorkspace / loadWorkspace / listWorkspaces", () => {
  it("없으면 생성하고 projects에 프로젝트를 추가한다", async () => {
    const ws = await ensureWorkspace("team-a", "/tmp/proj1");
    expect(ws.name).toBe("team-a");
    expect(ws.projects).toEqual(["/tmp/proj1"]);

    const loaded = await loadWorkspace("team-a");
    expect(loaded).toEqual(ws);
  });

  it("다시 호출하면 created_at은 유지하고 projects는 중복없이 병합한다", async () => {
    const first = await ensureWorkspace("team-a", "/tmp/proj1");
    const second = await ensureWorkspace("team-a", "/tmp/proj2");
    expect(second.created_at).toBe(first.created_at);
    expect(second.projects.sort()).toEqual(["/tmp/proj1", "/tmp/proj2"]);

    const third = await ensureWorkspace("team-a", "/tmp/proj1"); // 중복
    expect(third.projects.length).toBe(2);
  });

  it("listWorkspaces는 존재하는 모든 워크스페이스를 반환한다", async () => {
    await ensureWorkspace("team-a");
    await ensureWorkspace("team-b");
    const list = await listWorkspaces();
    expect(list.map((w) => w.name).sort()).toEqual(["team-a", "team-b"]);
  });

  it("없는 워크스페이스는 null", async () => {
    expect(await loadWorkspace("nonexistent")).toBeNull();
  });
});

describe("Task CRUD", () => {
  it("addTask는 pending 기본 상태로 태스크를 만든다", async () => {
    const task = await addTask("team-a", { title: "로그인 구현", project: "/tmp/proj1" });
    expect(task.status).toBe("pending");
    expect(task.started_at).toBeUndefined();
    expect(task.id).toMatch(/^task-/);
  });

  it("in_progress로 생성하면 started_at이 채워진다", async () => {
    const task = await addTask("team-a", { title: "로그인 구현", project: "/tmp/proj1", status: "in_progress" });
    expect(task.started_at).toBeDefined();
  });

  it("listTasks는 project/status로 필터링한다", async () => {
    await addTask("team-a", { title: "A", project: "/tmp/proj1", status: "pending" });
    await addTask("team-a", { title: "B", project: "/tmp/proj2", status: "done" });
    await addTask("team-a", { title: "C", project: "/tmp/proj1", status: "done" });

    expect((await listTasks("team-a")).length).toBe(3);
    expect((await listTasks("team-a", { project: "/tmp/proj1" })).length).toBe(2);
    expect((await listTasks("team-a", { status: "done" })).length).toBe(2);
    expect((await listTasks("team-a", { project: "/tmp/proj1", status: "done" })).length).toBe(1);
  });

  it("updateTask로 status를 done으로 바꾸면 completed_at이 채워진다", async () => {
    const task = await addTask("team-a", { title: "A", project: "/tmp/proj1" });
    const updated = await updateTask("team-a", task.id, { status: "done", summary: "완료" });
    expect(updated?.status).toBe("done");
    expect(updated?.completed_at).toBeDefined();
    expect(updated?.summary).toBe("완료");
  });

  it("존재하지 않는 taskId를 업데이트하면 null", async () => {
    expect(await updateTask("team-a", "task-nonexistent", { status: "done" })).toBeNull();
  });

  it("getTask로 단일 태스크를 조회한다", async () => {
    const task = await addTask("team-a", { title: "A", project: "/tmp/proj1" });
    const fetched = await getTask("team-a", task.id);
    expect(fetched?.id).toBe(task.id);
  });

  it("동시에 여러 addTask를 호출해도 하나도 유실되지 않는다(락 검증)", async () => {
    const count = 10;
    await Promise.all(
      Array.from({ length: count }, (_, i) => addTask("team-a", { title: `T${i}`, project: "/tmp/proj1" })),
    );
    const tasks = await listTasks("team-a");
    expect(tasks.length).toBe(count);
    expect(new Set(tasks.map((t) => t.id)).size).toBe(count);
  });

  it("updateTask로 patchInfo를 기록할 수 있다(§7.1 Patch 성숙화)", async () => {
    const task = await addTask("team-a", { title: "A", project: "/tmp/proj1", prd_ref: "/tmp/proj1/sugo/features/x/prd.md" });
    await updateTask("team-a", task.id, { patchInfo: { parentTaskId: task.id, patchVersion: 2, seed: "추가 요청사항" } });
    const updated = await getTask("team-a", task.id);
    expect(updated?.patchInfo).toEqual({ parentTaskId: task.id, patchVersion: 2, seed: "추가 요청사항" });
  });
});

describe("findTaskByPrdRef — §7.1 base-task 매칭(patch가 원본 Run을 재사용하기 위한 조회)", () => {
  it("prd_ref가 정확히 일치하는 태스크를 찾는다", async () => {
    const task = await addTask("team-a", { title: "A", project: "/tmp/proj1", prd_ref: "/tmp/proj1/sugo/features/x/prd.md" });
    const found = await findTaskByPrdRef("team-a", "/tmp/proj1/sugo/features/x/prd.md");
    expect(found?.id).toBe(task.id);
  });

  it("정확 일치가 없으면 파일명만으로 폴백 매칭한다", async () => {
    const task = await addTask("team-a", { title: "A", project: "/tmp/proj1", prd_ref: "C:\\proj1\\sugo\\features\\x\\prd.md" });
    const found = await findTaskByPrdRef("team-a", "/proj1/sugo/features/x/prd.md");
    expect(found?.id).toBe(task.id);
  });

  it("일치하는 태스크가 없으면 null", async () => {
    expect(await findTaskByPrdRef("team-a", "/nonexistent/prd.md")).toBeNull();
  });
});
