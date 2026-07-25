import { describe, expect, it } from "vitest";
import {
  computeRequirementCoverage,
  detectFileOverlaps,
  findManifestCycle,
  validateIntegration,
  validateManifest,
  type SubtaskManifestEntry,
} from "../src/decompose.js";

function subtask(overrides: Partial<SubtaskManifestEntry> = {}): SubtaskManifestEntry {
  return {
    id: "S-1",
    title: "subtask",
    dependsOn: [],
    files: [],
    coversRequirements: [],
    status: "pending",
    ...overrides,
  };
}

describe("findManifestCycle", () => {
  it("의존성이 없으면 null", () => {
    expect(findManifestCycle([subtask({ id: "A" }), subtask({ id: "B" })])).toBeNull();
  });

  it("단순 사이클(A→B→A)을 찾는다", () => {
    const cycle = findManifestCycle([
      subtask({ id: "A", dependsOn: ["B"] }),
      subtask({ id: "B", dependsOn: ["A"] }),
    ]);
    expect(cycle).not.toBeNull();
    expect(cycle).toContain("A");
    expect(cycle).toContain("B");
  });

  it("자기참조 사이클(A→A)을 찾는다", () => {
    const cycle = findManifestCycle([subtask({ id: "A", dependsOn: ["A"] })]);
    expect(cycle).toEqual(["A", "A"]);
  });

  it("존재하지 않는 의존 id는 무시한다(별개 참조오류)", () => {
    expect(findManifestCycle([subtask({ id: "A", dependsOn: ["ghost"] })])).toBeNull();
  });

  it("선형 의존(A→B→C, 사이클 없음)은 null", () => {
    const cycle = findManifestCycle([
      subtask({ id: "A", dependsOn: ["B"] }),
      subtask({ id: "B", dependsOn: ["C"] }),
      subtask({ id: "C", dependsOn: [] }),
    ]);
    expect(cycle).toBeNull();
  });
});

describe("detectFileOverlaps", () => {
  it("겹치는 파일이 없으면 빈 배열", () => {
    expect(detectFileOverlaps([{ id: "A", files: ["a.ts"] }, { id: "B", files: ["b.ts"] }])).toEqual([]);
  });

  it("두 서브태스크가 같은 파일을 선언하면 겹침으로 잡는다", () => {
    const overlaps = detectFileOverlaps([
      { id: "A", files: ["shared.ts"] },
      { id: "B", files: ["shared.ts"] },
    ]);
    expect(overlaps.length).toBe(1);
    expect(overlaps[0].subtaskIds.sort()).toEqual(["A", "B"]);
  });
});

describe("computeRequirementCoverage", () => {
  it("모든 REQ가 커버되면 uncovered가 빈 배열", () => {
    const coverage = computeRequirementCoverage(
      ["REQ-1", "REQ-2"],
      [{ coversRequirements: ["REQ-1"] }, { coversRequirements: ["REQ-2"] }],
    );
    expect(coverage.uncovered).toEqual([]);
    expect(coverage.covered.sort()).toEqual(["REQ-1", "REQ-2"]);
  });

  it("커버 안 된 REQ를 찾는다", () => {
    const coverage = computeRequirementCoverage(["REQ-1", "REQ-2"], [{ coversRequirements: ["REQ-1"] }]);
    expect(coverage.uncovered).toEqual(["REQ-2"]);
  });
});

describe("validateManifest — 반드시 거부", () => {
  it("사이클이 있으면 거부한다", () => {
    const result = validateManifest(
      { subtasks: [subtask({ id: "A", dependsOn: ["B"] }), subtask({ id: "B", dependsOn: ["A"] })] },
      [],
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("MANIFEST_HAS_CYCLE");
  });

  it("파일 계획이 겹치면 거부한다", () => {
    const result = validateManifest(
      {
        subtasks: [
          subtask({ id: "A", files: ["shared.ts"] }),
          subtask({ id: "B", files: ["shared.ts"] }),
        ],
      },
      [],
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("MANIFEST_FILE_OVERLAP");
  });

  it("요구사항이 커버되지 않으면 거부한다", () => {
    const result = validateManifest({ subtasks: [subtask({ id: "A", coversRequirements: ["REQ-1"] })] }, [
      "REQ-1",
      "REQ-2",
    ]);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("MANIFEST_REQUIREMENT_UNCOVERED");
  });
});

describe("validateManifest — 반드시 허용", () => {
  it("사이클 없음 + 파일 안 겹침 + 요구사항 전부 커버되면 통과", () => {
    const result = validateManifest(
      {
        subtasks: [
          subtask({ id: "A", files: ["a.ts"], coversRequirements: ["REQ-1"] }),
          subtask({ id: "B", files: ["b.ts"], coversRequirements: ["REQ-2"], dependsOn: ["A"] }),
        ],
      },
      ["REQ-1", "REQ-2"],
    );
    expect(result.ok).toBe(true);
  });
});

describe("validateIntegration — 반드시 거부", () => {
  it("완료 안 된 서브태스크가 있으면 거부한다", () => {
    const result = validateIntegration({
      subtasks: [subtask({ id: "A", status: "done" }), subtask({ id: "B", status: "in_progress" })],
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("SUBTASKS_INCOMPLETE");
  });

  it("실제 변경파일이 겹치면 거부한다(계획엔 안 겹쳤어도)", () => {
    const result = validateIntegration({
      subtasks: [
        subtask({ id: "A", status: "done", files: ["a.ts"], changedFiles: ["shared.ts"] }),
        subtask({ id: "B", status: "done", files: ["b.ts"], changedFiles: ["shared.ts"] }),
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.code).toBe("MANIFEST_FILE_OVERLAP");
  });
});

describe("validateIntegration — 반드시 허용", () => {
  it("전부 완료 + 실제 변경파일도 안 겹치면 통과한다", () => {
    const result = validateIntegration({
      subtasks: [
        subtask({ id: "A", status: "done", changedFiles: ["a.ts"] }),
        subtask({ id: "B", status: "done", changedFiles: ["b.ts"] }),
      ],
    });
    expect(result.ok).toBe(true);
  });
});
