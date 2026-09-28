import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addRoadmapNode,
  backfillRoadmapTask,
  backfillLegacyRoadmapWorkResults,
  completeTaskRequirements,
  getReadySet,
  getRoadmapNode,
  groupRoadmapNodes,
  linkRoadmapNodes,
  listRoadmapNodes,
  markRequirementDone,
  reconcileRoadmapWithTasks,
  recordRoadmapWorkResult,
  removeRoadmapNode,
  unlinkRoadmapNodes,
  updateRoadmapNodeStatus,
  upsertRoadmapNodes,
} from "../src/hulk/roadmap.js";
import { promotePrdRequirements, reqConfirmId } from "../src/hulk/roadmapReq.js";

let fakeHome: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-roadmap-home-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
});

describe("addRoadmapNode / getRoadmapNode / listRoadmapNodes", () => {
  it("노드를 추가하고 다시 읽을 수 있다", async () => {
    const result = await addRoadmapNode("ws1", {
      id: "T-1",
      title: "기능 A",
      level: "task",
      status: "pending",
      dependsOn: [],
    });
    expect(result.ok).toBe(true);
    const loaded = await getRoadmapNode("ws1", "T-1");
    expect(loaded?.title).toBe("기능 A");
  });

  it("같은 id를 다시 추가하면 거부한다", async () => {
    await addRoadmapNode("ws1", { id: "T-1", title: "A", level: "task", status: "pending", dependsOn: [] });
    const result = await addRoadmapNode("ws1", { id: "T-1", title: "B", level: "task", status: "pending", dependsOn: [] });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("DUPLICATE_ID");
  });

  it("존재하지 않는 의존을 참조해도 추가는 되지만(unknownDeps는 readySet에서 안전측 처리) 사이클은 아니다", async () => {
    const result = await addRoadmapNode("ws1", {
      id: "T-1",
      title: "A",
      level: "task",
      status: "pending",
      dependsOn: ["GHOST"],
    });
    expect(result.ok).toBe(true);
  });

  it("추가로 사이클이 생기면 거부한다(반드시 거부)", async () => {
    await addRoadmapNode("ws1", { id: "A", title: "A", level: "task", status: "pending", dependsOn: [] });
    await addRoadmapNode("ws1", { id: "B", title: "B", level: "task", status: "pending", dependsOn: ["A"] });
    // C가 B에 의존하고, A가 나중에 C에 의존하게 고치면 사이클: 여기선 직접 사이클을 재현한다.
    const cyclic = await addRoadmapNode("ws1", { id: "A2", title: "A2", level: "task", status: "pending", dependsOn: ["A2"] });
    expect(cyclic.ok).toBe(false);
    expect(cyclic.error).toBe("CYCLE");
  });

  it("listRoadmapNodes로 전체 목록을 확인한다", async () => {
    await addRoadmapNode("ws1", { id: "A", title: "A", level: "task", status: "pending", dependsOn: [] });
    await addRoadmapNode("ws1", { id: "B", title: "B", level: "workstream", status: "pending", dependsOn: [] });
    const all = await listRoadmapNodes("ws1");
    expect(all.map((n) => n.id).sort()).toEqual(["A", "B"]);
    const onlyTasks = await listRoadmapNodes("ws1", { level: "task" });
    expect(onlyTasks.map((n) => n.id)).toEqual(["A"]);
  });
});

describe("upsertRoadmapNodes — PRD REQ 승격 심기", () => {
  it("promotePrdRequirements 결과를 그대로 심을 수 있다", async () => {
    const nodes = promotePrdRequirements("t-1", "### REQ-1: A\n### REQ-2: B");
    await addRoadmapNode("ws1", { id: "t-1", title: "기능", level: "task", status: "in_progress", dependsOn: [] });
    await upsertRoadmapNodes("ws1", nodes);
    const req1 = await getRoadmapNode("ws1", "t-1::REQ-1");
    const confirm = await getRoadmapNode("ws1", reqConfirmId("t-1"));
    expect(req1?.parent).toBe("t-1");
    expect(confirm?.dependsOn.sort()).toEqual(["t-1::REQ-1", "t-1::REQ-2"]);
  });

  it("이미 있는 id를 다시 upsert하면 갱신한다(중복추가 거부 아님)", async () => {
    await upsertRoadmapNodes("ws1", [{ id: "A", title: "old", level: "task", status: "pending", dependsOn: [] }]);
    await upsertRoadmapNodes("ws1", [{ id: "A", title: "new", level: "task", status: "in_progress", dependsOn: [] }]);
    const node = await getRoadmapNode("ws1", "A");
    expect(node?.title).toBe("new");
    expect(node?.status).toBe("in_progress");
  });
});

describe("reconcileRoadmapWithTasks — 레거시 데이터 4층 승격", () => {
  it("REQ id를 task로 namespace하고 Spec→Run→Task 계층과 완료 상태를 복구한다", async () => {
    await upsertRoadmapNodes("ws1", [
      { id: "task-a", title: "A", level: "task", status: "in_progress", dependsOn: [] },
      { id: "REQ-1", title: "요구1", level: "subtask", status: "pending", dependsOn: [], parent: "task-a" },
      { id: "REQ-2", title: "요구2", level: "subtask", status: "pending", dependsOn: ["REQ-1"], parent: "task-a" },
    ]);
    await reconcileRoadmapWithTasks("ws1", [
      {
        id: "task-a",
        title: "A",
        project: "/tmp/a",
        status: "done",
        created_at: "2026-01-01T00:00:00.000Z",
        prd_ref: "/tmp/a/prd.md",
      },
    ]);
    const nodes = await listRoadmapNodes("ws1");
    expect(nodes.find((n) => n.id === "task-a")?.parent).toBe("run-task-a");
    expect(nodes.find((n) => n.id === "run-task-a")?.parent).toBe("spec-task-a");
    expect(nodes.find((n) => n.id === "task-a::REQ-2")?.dependsOn).toEqual(["task-a::REQ-1"]);
    expect(nodes.find((n) => n.id === "task-a::REQ-1")?.status).toBe("done");
    expect(nodes.some((n) => n.id === "REQ-1")).toBe(false);
  });

  it("patch task의 기존 versioned Run을 보존하고 기본 Run을 중복 생성하지 않는다", async () => {
    await upsertRoadmapNodes("ws1", [
      { id: "spec-task-a", title: "A", level: "spec", status: "in_progress", dependsOn: [] },
      { id: "run-task-a-v2", title: "A patch v2", level: "workstream", status: "in_progress", dependsOn: [], parent: "spec-task-a" },
      { id: "task-a", title: "A", level: "task", status: "in_progress", dependsOn: [], parent: "run-task-a-v2" },
    ]);
    await reconcileRoadmapWithTasks("ws1", [
      { id: "task-a", title: "A", project: "/tmp/a", status: "done", created_at: "2026-01-01T00:00:00.000Z" },
    ]);
    const nodes = await listRoadmapNodes("ws1");
    expect(nodes.find((n) => n.id === "task-a")?.parent).toBe("run-task-a-v2");
    expect(nodes.find((n) => n.id === "run-task-a-v2")?.status).toBe("done");
    expect(nodes.some((n) => n.id === "run-task-a")).toBe(false);
  });
});

describe("updateRoadmapNodeStatus", () => {
  it("상태와 result를 갱신한다", async () => {
    await addRoadmapNode("ws1", { id: "A", title: "A", level: "task", status: "pending", dependsOn: [] });
    await updateRoadmapNodeStatus("ws1", "A", "done", { summary: "완료됨" });
    const node = await getRoadmapNode("ws1", "A");
    expect(node?.status).toBe("done");
    expect(node?.result?.summary).toBe("완료됨");
  });
});

describe("recordRoadmapWorkResult", () => {
  it("lineage 도입 전에 완료된 feat 결과를 첫 patch 기록 시 v0으로 보존한다", async () => {
    await upsertRoadmapNodes("ws1", [
      { id: "run-a", title: "RUN", level: "workstream", status: "done", dependsOn: [] },
      {
        id: "task-a",
        title: "최초 구현",
        level: "task",
        status: "done",
        dependsOn: [],
        parent: "run-a",
        workResult: {
          path: "/feature/work-result.md",
          endedAt: "2026-01-01T00:00:00.000Z",
          summary: "최초 feat 결과",
        },
      },
    ]);

    await recordRoadmapWorkResult(
      "ws1",
      "task-a",
      { path: "/feature/work-result-patch-v1.md", summary: "첫 patch", patchVersion: 1 },
      { version: 1, completedAt: "2026-01-02T00:00:00.000Z", summary: "첫 patch" },
    );

    const task = await getRoadmapNode("ws1", "task-a");
    expect(task?.lineage?.map((entry) => entry.version)).toEqual([0, 1]);
    expect(task?.lineage?.[0]).toMatchObject({
      version: 0,
      completedAt: "2026-01-01T00:00:00.000Z",
      title: "최초 구현",
      summary: "최초 feat 결과",
      workResult: { path: "/feature/work-result.md" },
    });
  });

  it("완료 산출물은 Task/RUN에 기록하고 patch 계보는 Task에만 기록한다", async () => {
    await upsertRoadmapNodes("ws1", [
      { id: "run-a", title: "RUN", level: "workstream", status: "done", dependsOn: [] },
      { id: "task-a", title: "Task", level: "task", status: "done", dependsOn: [], parent: "run-a" },
      { id: "task-a::REQ-1", title: "중복 요청 차단", level: "subtask", status: "done", dependsOn: [], parent: "task-a" },
    ]);
    await recordRoadmapWorkResult("ws1", "task-a", { path: "/work-result-patch-v1.md", summary: "완료", patchVersion: 1 }, { version: 1, completedAt: "2026-01-01T00:00:00.000Z", summary: "완료" });
    const task = await getRoadmapNode("ws1", "task-a");
    const run = await getRoadmapNode("ws1", "run-a");
    expect(task?.workResult?.path).toBe("/work-result-patch-v1.md");
    expect(run?.workResult?.path).toBe("/work-result-patch-v1.md");
    expect(task?.lineage).toEqual([expect.objectContaining({ version: 1 })]);
    expect(task?.lineage?.[0].requirements).toEqual([
      expect.objectContaining({ id: "task-a::REQ-1", title: "중복 요청 차단", status: "done" }),
    ]);
    expect(task?.lineage?.[0].workResult?.path).toBe("/work-result-patch-v1.md");
    expect(run?.lineage).toBeUndefined();
  });
});

describe("backfillLegacyRoadmapWorkResults", () => {
  it("파이프라인 밖에서 완료된 옛 Task도 work-result를 만들어 Patch 진입점을 복구한다", async () => {
    const featureDir = join(fakeHome, "project", "sugo", "features", "20260921", "legacy");
    mkdirSync(featureDir, { recursive: true });
    const prdPath = join(featureDir, "prd.md");
    writeFileSync(prdPath, "# Legacy PRD\n");
    await reconcileRoadmapWithTasks("ws1", [{
      id: "task-legacy",
      title: "legacy",
      project: join(fakeHome, "project"),
      status: "done",
      summary: "직접 커밋으로 완료되어 기존 work-result가 없던 작업",
      prd_ref: prdPath,
      created_at: "2026-09-21T01:00:00.000Z",
      started_at: "2026-09-21T01:10:00.000Z",
      completed_at: "2026-09-21T02:00:00.000Z",
    }]);

    const count = await backfillLegacyRoadmapWorkResults("ws1", [{
      id: "task-legacy",
      title: "legacy",
      project: join(fakeHome, "project"),
      status: "done",
      summary: "직접 커밋으로 완료되어 기존 work-result가 없던 작업",
      prd_ref: prdPath,
      created_at: "2026-09-21T01:00:00.000Z",
      started_at: "2026-09-21T01:10:00.000Z",
      completed_at: "2026-09-21T02:00:00.000Z",
    }]);

    const workResultPath = join(featureDir, "work-result.md");
    expect(count).toBe(1);
    expect(existsSync(workResultPath)).toBe(true);
    expect(readFileSync(workResultPath, "utf8")).toContain("직접 커밋");
    expect((await getRoadmapNode("ws1", "task-legacy"))?.workResult?.path).toBe(workResultPath);
    expect((await getRoadmapNode("ws1", "run-task-legacy"))?.workResult?.path).toBe(workResultPath);
  });
});

describe("markRequirementDone — 반드시 거부/허용", () => {
  it("REQ-CONFIRM을 직접 완료 처리하려 하면 거부한다(에이전트 직접완료 금지, §8.5 코퍼스)", async () => {
    const nodes = promotePrdRequirements("t-1", "### REQ-1: A");
    await addRoadmapNode("ws1", { id: "t-1", title: "기능", level: "task", status: "in_progress", dependsOn: [] });
    await upsertRoadmapNodes("ws1", nodes);
    const result = await markRequirementDone("ws1", reqConfirmId("t-1"));
    expect(result.ok).toBe(false);
    expect(result.error).toBe("REQ_CONFIRM_AGENT_FORBIDDEN");
    const confirm = await getRoadmapNode("ws1", reqConfirmId("t-1"));
    expect(confirm?.status).toBe("pending");
  });

  it("일반 REQ 노드는 mark_req로 완료 처리할 수 있다", async () => {
    const nodes = promotePrdRequirements("t-1", "### REQ-1: A");
    await addRoadmapNode("ws1", { id: "t-1", title: "기능", level: "task", status: "in_progress", dependsOn: [] });
    await upsertRoadmapNodes("ws1", nodes);
    const result = await markRequirementDone("ws1", "t-1::REQ-1");
    expect(result.ok).toBe(true);
    const req1 = await getRoadmapNode("ws1", "t-1::REQ-1");
    expect(req1?.status).toBe("done");
  });
});

describe("completeTaskRequirements — review_done 자동완료 연동", () => {
  it("taskId의 모든 REQ + REQ-CONFIRM을 한 번에 done 처리한다(사용자 확인이 곧 롤다운)", async () => {
    const nodes = promotePrdRequirements("t-1", "### REQ-1: A\n### REQ-2: B");
    await addRoadmapNode("ws1", { id: "t-1", title: "기능", level: "task", status: "in_progress", dependsOn: [] });
    await upsertRoadmapNodes("ws1", nodes);

    await completeTaskRequirements("ws1", "t-1", "review_done으로 확인 완료");

    const req1 = await getRoadmapNode("ws1", "t-1::REQ-1");
    const req2 = await getRoadmapNode("ws1", "t-1::REQ-2");
    const confirm = await getRoadmapNode("ws1", reqConfirmId("t-1"));
    expect(req1?.status).toBe("done");
    expect(req2?.status).toBe("done");
    expect(confirm?.status).toBe("done");
    expect(confirm?.result?.summary).toBe("review_done으로 확인 완료");
  });

  it("REQ 승격이 안 된 taskId(워크스페이스 미등록 등)를 불러도 조용히 no-op한다", async () => {
    await expect(completeTaskRequirements("ws1", "nonexistent-task", "요약")).resolves.not.toThrow();
  });
});

describe("link/unlink — task↔task만 허용(fail-closed)", () => {
  it("두 task 노드 사이에 링크를 걸 수 있다", async () => {
    await addRoadmapNode("ws1", { id: "A", title: "A", level: "task", status: "pending", dependsOn: [] });
    await addRoadmapNode("ws1", { id: "B", title: "B", level: "task", status: "pending", dependsOn: [] });
    const result = await linkRoadmapNodes("ws1", "B", "A");
    expect(result.ok).toBe(true);
    const b = await getRoadmapNode("ws1", "B");
    expect(b?.dependsOn).toContain("A");
  });

  it("task가 아닌 레벨(subtask 등)끼리는 fail-closed로 거부한다", async () => {
    await addRoadmapNode("ws1", { id: "A", title: "A", level: "subtask", status: "pending", dependsOn: [] });
    await addRoadmapNode("ws1", { id: "B", title: "B", level: "task", status: "pending", dependsOn: [] });
    const result = await linkRoadmapNodes("ws1", "B", "A");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("LINK_REQUIRES_TASK_LEVEL");
  });

  it("사이클을 만드는 링크는 거부한다", async () => {
    await addRoadmapNode("ws1", { id: "A", title: "A", level: "task", status: "pending", dependsOn: [] });
    await addRoadmapNode("ws1", { id: "B", title: "B", level: "task", status: "pending", dependsOn: ["A"] });
    const result = await linkRoadmapNodes("ws1", "A", "B");
    expect(result.ok).toBe(false);
    expect(result.error).toBe("CYCLE");
  });

  it("unlink로 링크를 제거할 수 있다", async () => {
    await addRoadmapNode("ws1", { id: "A", title: "A", level: "task", status: "pending", dependsOn: [] });
    await addRoadmapNode("ws1", { id: "B", title: "B", level: "task", status: "pending", dependsOn: ["A"] });
    await unlinkRoadmapNodes("ws1", "B", "A");
    const b = await getRoadmapNode("ws1", "B");
    expect(b?.dependsOn).not.toContain("A");
  });
});

describe("group — workstream으로 task들을 묶는다", () => {
  it("workstream 노드를 만들고 지정한 task들의 parent를 설정한다", async () => {
    await addRoadmapNode("ws1", { id: "A", title: "A", level: "task", status: "pending", dependsOn: [] });
    await addRoadmapNode("ws1", { id: "B", title: "B", level: "task", status: "pending", dependsOn: [] });
    await groupRoadmapNodes("ws1", "WS-1", "인증 워크스트림", ["A", "B"]);
    const ws = await getRoadmapNode("ws1", "WS-1");
    const a = await getRoadmapNode("ws1", "A");
    expect(ws?.level).toBe("workstream");
    expect(a?.parent).toBe("WS-1");
  });
});

describe("backfillRoadmapTask — 기존 HULK Task를 소급 승격", () => {
  it("아직 roadmap에 없는 taskId를 task 레벨 노드로 만든다", async () => {
    const result = await backfillRoadmapTask("ws1", "old-task-1", "예전 기능");
    expect(result.ok).toBe(true);
    const node = await getRoadmapNode("ws1", "old-task-1");
    expect(node?.level).toBe("task");
    expect(node?.ref).toBe("old-task-1");
  });

  it("이미 있으면 중복 생성하지 않는다(멱등)", async () => {
    await backfillRoadmapTask("ws1", "old-task-1", "예전 기능");
    const second = await backfillRoadmapTask("ws1", "old-task-1", "예전 기능(재시도)");
    expect(second.ok).toBe(true);
    const all = await listRoadmapNodes("ws1");
    expect(all.filter((n) => n.id === "old-task-1")).toHaveLength(1);
  });
});

describe("removeRoadmapNode", () => {
  it("노드를 지우고 다른 노드의 dependsOn에서도 참조를 제거한다", async () => {
    await addRoadmapNode("ws1", { id: "A", title: "A", level: "task", status: "pending", dependsOn: [] });
    await addRoadmapNode("ws1", { id: "B", title: "B", level: "task", status: "pending", dependsOn: ["A"] });
    await removeRoadmapNode("ws1", "A");
    expect(await getRoadmapNode("ws1", "A")).toBeNull();
    const b = await getRoadmapNode("ws1", "B");
    expect(b?.dependsOn).not.toContain("A");
  });
});

describe("getReadySet — 로드 후 순수함수 위임", () => {
  it("done된 의존성만 가진 pending 노드를 반환한다", async () => {
    await addRoadmapNode("ws1", { id: "A", title: "A", level: "task", status: "done", dependsOn: [] });
    await addRoadmapNode("ws1", { id: "B", title: "B", level: "task", status: "pending", dependsOn: ["A"] });
    expect(await getReadySet("ws1")).toEqual(["B"]);
  });
});
