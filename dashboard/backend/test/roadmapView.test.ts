import { describe, expect, it } from "vitest";
import { roadmapCounts, roadmapIssues, type RoadmapViewNode } from "../src/services/roadmapGraph.js";

const n = (
  id: string,
  level: string,
  status: string,
  extra: Partial<RoadmapViewNode> = {},
): RoadmapViewNode => ({ id, title: id, level, status, parent: null, dependsOn: [], ...extra });

describe("roadmapCounts", () => {
  it("task만 센다 — spec/workstream/subtask를 같이 세면 같은 일이 세 번 세어진다", () => {
    expect(
      roadmapCounts([
        n("s", "spec", "in_progress"),
        n("r", "workstream", "in_progress", { parent: "s" }),
        n("t1", "task", "done", { parent: "r" }),
        n("t2", "task", "pending", { parent: "r" }),
        n("t1::REQ-1", "subtask", "done", { parent: "t1" }),
      ]),
    ).toEqual({ total: 2, pending: 1, in_progress: 0, done: 1, blocked: 0, dropped: 0 });
  });

  it("manual_status가 status를 이긴다", () => {
    const counts = roadmapCounts([n("t1", "task", "pending", { manualStatus: "done" })]);
    expect(counts.done).toBe(1);
    expect(counts.pending).toBe(0);
  });
});

describe("roadmapIssues", () => {
  it("이상 없으면 빈 배열 — 경고를 남발하면 진짜 경고가 묻힌다", () => {
    expect(
      roadmapIssues([
        n("s", "spec", "in_progress"),
        n("t1", "task", "done", { parent: "s" }),
        n("t2", "task", "pending", { parent: "s", dependsOn: ["t1"] }),
      ]),
    ).toEqual([]);
  });

  it("의존 사이클을 잡는다", () => {
    const issues = roadmapIssues([
      n("t1", "task", "pending", { dependsOn: ["t2"] }),
      n("t2", "task", "pending", { dependsOn: ["t1"] }),
    ]);
    expect(issues.some((i) => i.includes("사이클"))).toBe(true);
  });

  it("존재하지 않는 노드를 가리키는 의존을 잡는다", () => {
    expect(roadmapIssues([n("t1", "task", "pending", { dependsOn: ["ghost"] })]).some((i) => i.includes("ghost"))).toBe(true);
  });

  it("부모가 사라진 노드를 잡는다 — 캔버스에서 최상위로 튄다", () => {
    expect(roadmapIssues([n("t1", "task", "pending", { parent: "gone" })]).some((i) => i.includes("부모가 사라진"))).toBe(true);
  });

  it("task가 아닌 노드에 걸린 의존을 잡는다 — 링크 계약 위반", () => {
    const issues = roadmapIssues([
      n("r1", "workstream", "done"),
      n("r2", "workstream", "pending", { dependsOn: ["r1"] }),
    ]);
    expect(issues.some((i) => i.includes("task가 아닌"))).toBe(true);
  });

  it("하위가 전부 done인데 안 닫힌 그릇을 알려준다", () => {
    const issues = roadmapIssues([
      n("r", "workstream", "in_progress"),
      n("t1", "task", "done", { parent: "r" }),
      n("t2", "task", "done", { parent: "r" }),
    ]);
    expect(issues.some((i) => i.includes("안 닫힌"))).toBe(true);
  });

  it("이미 done인 그릇은 닫으라고 하지 않는다", () => {
    const issues = roadmapIssues([n("r", "workstream", "done"), n("t1", "task", "done", { parent: "r" })]);
    expect(issues.some((i) => i.includes("안 닫힌"))).toBe(false);
  });
});
