import { describe, expect, it } from "vitest";
import { isRequirementCovered } from "./reviewRequirementEvidence.js";

describe("isRequirementCovered", () => {
  it("uses explicit report evidence before roadmap status", () => {
    expect(isRequirementCovered({ id: "REQ-1", title: "대상 판별", status: "pending" }, [{ id: "REQ-1", covered: true }])).toBe(true);
    expect(isRequirementCovered({ id: "REQ-2", title: "배정 조회", status: "done" }, [{ id: "REQ-2", covered: false }])).toBe(false);
  });

  it("matches a report id at the beginning of a requirement title", () => {
    expect(isRequirementCovered({ id: "node-1", title: "REQ-3. Redis 상태 조회", status: "pending" }, [{ id: "REQ-3", covered: true }])).toBe(true);
  });

  it("falls back to the roadmap status when report evidence is absent", () => {
    expect(isRequirementCovered({ id: "REQ-4", title: "저장", status: "done" })).toBe(true);
  });
});
