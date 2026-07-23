import { describe, expect, it } from "vitest";
import { mergeRoadmapOwnership, readySet, topoSort, wouldCreateCycle } from "../src/hulk/roadmapGraph.js";
import type { RoadmapNode } from "../src/hulk/types.js";

function node(id: string, dependsOn: string[] = [], status: RoadmapNode["status"] = "pending"): RoadmapNode {
  return { id, title: id, level: "task", status, dependsOn };
}

describe("topoSort", () => {
  it("의존성이 없으면 알파벳 순으로 정렬한다(결정론적 타이브레이크)", () => {
    const result = topoSort([node("C"), node("A"), node("B")]);
    expect(result.cyclic).toBe(false);
    expect(result.order).toEqual(["A", "B", "C"]);
  });

  it("의존성 순서를 지킨다", () => {
    const result = topoSort([node("A", ["B"]), node("B", ["C"]), node("C")]);
    expect(result.cyclic).toBe(false);
    expect(result.order).toEqual(["C", "B", "A"]);
  });

  it("같은 준비상태의 노드가 여럿이면 알파벳 순으로 뽑는다", () => {
    const result = topoSort([node("Z", ["A"]), node("Y", ["A"]), node("A")]);
    expect(result.order).toEqual(["A", "Y", "Z"]);
  });

  it("사이클을 감지한다(반드시 거부)", () => {
    const result = topoSort([node("A", ["B"]), node("B", ["A"])]);
    expect(result.cyclic).toBe(true);
  });

  it("존재하지 않는 의존 id를 unknownDeps로 보고한다", () => {
    const result = topoSort([node("A", ["GHOST"])]);
    expect(result.unknownDeps).toEqual(["GHOST"]);
  });
});

describe("readySet", () => {
  it("의존성이 전부 done인 pending 노드만 ready로 판정한다(반드시 허용)", () => {
    const nodes = [node("A", [], "done"), node("B", ["A"], "pending")];
    expect(readySet(nodes)).toEqual(["B"]);
  });

  it("의존성 중 하나라도 done이 아니면 ready가 아니다(반드시 거부)", () => {
    const nodes = [node("A", [], "pending"), node("B", ["A"], "pending")];
    expect(readySet(nodes)).toEqual(["A"]);
  });

  it("미지의 의존 id는 안전측으로 not-done 취급한다(ready 아님)", () => {
    const nodes = [node("A", ["GHOST"], "pending")];
    expect(readySet(nodes)).toEqual([]);
  });

  it("이미 done/in_progress/dropped인 노드는 ready 후보에서 제외한다", () => {
    const nodes = [node("A", [], "done"), node("B", [], "in_progress"), node("C", [], "dropped")];
    expect(readySet(nodes)).toEqual([]);
  });

  it("의존성이 없는 pending 노드는 바로 ready다", () => {
    const nodes = [node("A", [])];
    expect(readySet(nodes)).toEqual(["A"]);
  });
});

describe("wouldCreateCycle", () => {
  it("새 엣지가 사이클을 만들면 true를 반환한다(반드시 거부)", () => {
    const nodes = [node("A", ["B"]), node("B")];
    // B가 A에 의존하게 하면 A<->B 사이클
    expect(wouldCreateCycle(nodes, "B", "A")).toBe(true);
  });

  it("새 엣지가 사이클을 안 만들면 false를 반환한다(반드시 허용)", () => {
    const nodes = [node("A"), node("B")];
    expect(wouldCreateCycle(nodes, "A", "B")).toBe(false);
  });

  it("자기 자신에 대한 의존은 사이클로 판정한다", () => {
    const nodes = [node("A")];
    expect(wouldCreateCycle(nodes, "A", "A")).toBe(true);
  });

  it("간접 사이클(A->B->C->A)도 감지한다", () => {
    const nodes = [node("A", ["B"]), node("B", ["C"]), node("C")];
    expect(wouldCreateCycle(nodes, "C", "A")).toBe(true);
  });
});

describe("mergeRoadmapOwnership — §7.2 소유권 경계", () => {
  it("dependsOn/manual_status/pos_x/pos_y는 원격값으로 덮어쓴다", () => {
    const local = [{ ...node("A", ["OLD"]), title: "로컬 제목" }];
    const merged = mergeRoadmapOwnership(local, [{ id: "A", dependsOn: ["NEW"], manual_status: "in_review", pos_x: 5, pos_y: 9 }]);
    expect(merged[0].dependsOn).toEqual(["NEW"]);
    expect(merged[0].manual_status).toBe("in_review");
    expect(merged[0].pos_x).toBe(5);
    expect(merged[0].pos_y).toBe(9);
  });

  it("title/level/status 등 플러그인 소유 필드는 절대 안 건드린다", () => {
    const local = [{ ...node("A", []), title: "로컬 제목", status: "in_progress" as const }];
    const merged = mergeRoadmapOwnership(local, [{ id: "A", dependsOn: ["X"] }]);
    expect(merged[0].title).toBe("로컬 제목");
    expect(merged[0].status).toBe("in_progress");
  });

  it("원격에 없는 로컬 전용 노드는 그대로 둔다", () => {
    const local = [node("A", ["B"])];
    const merged = mergeRoadmapOwnership(local, []);
    expect(merged[0].dependsOn).toEqual(["B"]);
  });
});
