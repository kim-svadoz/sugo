import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addRoadmapNode,
  backfillRoadmapTask,
  completeTaskRequirements,
  getReadySet,
  getRoadmapNode,
  groupRoadmapNodes,
  linkRoadmapNodes,
  listRoadmapNodes,
  markRequirementDone,
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
    const req1 = await getRoadmapNode("ws1", "REQ-1");
    const confirm = await getRoadmapNode("ws1", reqConfirmId("t-1"));
    expect(req1?.parent).toBe("t-1");
    expect(confirm?.dependsOn.sort()).toEqual(["REQ-1", "REQ-2"]);
  });

  it("이미 있는 id를 다시 upsert하면 갱신한다(중복추가 거부 아님)", async () => {
    await upsertRoadmapNodes("ws1", [{ id: "A", title: "old", level: "task", status: "pending", dependsOn: [] }]);
    await upsertRoadmapNodes("ws1", [{ id: "A", title: "new", level: "task", status: "in_progress", dependsOn: [] }]);
    const node = await getRoadmapNode("ws1", "A");
    expect(node?.title).toBe("new");
    expect(node?.status).toBe("in_progress");
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
    const result = await markRequirementDone("ws1", "REQ-1");
    expect(result.ok).toBe(true);
    const req1 = await getRoadmapNode("ws1", "REQ-1");
    expect(req1?.status).toBe("done");
  });
});

describe("completeTaskRequirements — review_done 자동완료 연동", () => {
  it("taskId의 모든 REQ + REQ-CONFIRM을 한 번에 done 처리한다(사용자 확인이 곧 롤다운)", async () => {
    const nodes = promotePrdRequirements("t-1", "### REQ-1: A\n### REQ-2: B");
    await addRoadmapNode("ws1", { id: "t-1", title: "기능", level: "task", status: "in_progress", dependsOn: [] });
    await upsertRoadmapNodes("ws1", nodes);

    await completeTaskRequirements("ws1", "t-1", "review_done으로 확인 완료");

    const req1 = await getRoadmapNode("ws1", "REQ-1");
    const req2 = await getRoadmapNode("ws1", "REQ-2");
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
