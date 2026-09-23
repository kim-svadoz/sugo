import { describe, expect, it } from "vitest";
import {
  cleanDanglingDeps,
  computeNodesToDelete,
  shouldSeedDependsOn,
} from "../src/services/roadmapDiff.js";

// 스펙 §7/설계안설계안 "roadmap sync 소유권" 코퍼스 — 반드시 막아야/반드시 지켜야를 그대로 인코딩.
describe("computeNodesToDelete — replace 시맨틱", () => {
  it("반드시 막아야: payload에 없는 workstream까지 삭제하면 안 된다", () => {
    const existing = [
      { id: "ws-1", level: "workstream", dependsOn: [] },
      { id: "task-1", level: "task", dependsOn: [] },
    ];
    const toDelete = computeNodesToDelete(existing, new Set(["task-1"]));
    expect(toDelete).not.toContain("ws-1");
  });

  it("반드시 지켜야: payload에 없는 non-workstream(task/subtask/spec)은 삭제한다", () => {
    const existing = [
      { id: "task-1", level: "task", dependsOn: [] },
      { id: "task-2", level: "task", dependsOn: [] },
      { id: "sub-1", level: "subtask", dependsOn: [] },
    ];
    const toDelete = computeNodesToDelete(existing, new Set(["task-1"]));
    expect(toDelete.sort()).toEqual(["sub-1", "task-2"]);
  });

  it("payload에 있는 노드는 level 무관하게 삭제 대상이 아니다", () => {
    const existing = [{ id: "task-1", level: "task", dependsOn: [] }];
    const toDelete = computeNodesToDelete(existing, new Set(["task-1"]));
    expect(toDelete).toEqual([]);
  });

  it("대시보드에서 만든 spec-manual 초안은 plugin snapshot에 없어도 보존한다", () => {
    const existing = [
      { id: "spec-manual-draft", level: "spec", dependsOn: [] },
      { id: "spec-plugin-owned", level: "spec", dependsOn: [] },
    ];
    expect(computeNodesToDelete(existing, new Set())).toEqual(["spec-plugin-owned"]);
  });
});

describe("cleanDanglingDeps", () => {
  it("삭제된 id에 대한 참조만 제거하고 나머지는 보존한다", () => {
    const result = cleanDanglingDeps(["a", "b", "c"], new Set(["b"]));
    expect(result).toEqual(["a", "c"]);
  });

  it("삭제된 id가 없으면 그대로 반환한다", () => {
    const result = cleanDanglingDeps(["a", "b"], new Set());
    expect(result).toEqual(["a", "b"]);
  });
});

describe("shouldSeedDependsOn — depends_on(순서) 소유권", () => {
  it("반드시 지켜야: 신규 노드는 항상 seed한다(최초 1회)", () => {
    expect(shouldSeedDependsOn(undefined)).toBe(true);
  });

  it("반드시 지켜야: 기존 depends_on이 비어있으면 seed한다", () => {
    expect(shouldSeedDependsOn([])).toBe(true);
  });

  it("반드시 막아야: 기존 depends_on이 이미 있으면(대시보드가 순서 편집함) 다시 seed하면 안 된다", () => {
    expect(shouldSeedDependsOn(["task-1"])).toBe(false);
  });
});
