import { describe, expect, it } from "vitest";
import { requirementCoverageState, verificationEvidenceState } from "./reviewRequirementEvidence.js";

describe("requirementCoverageState", () => {
  it("uses explicit report evidence before roadmap status", () => {
    expect(requirementCoverageState({ id: "REQ-1", title: "대상 판별", status: "pending" }, [{ id: "REQ-1", covered: true }])).toBe("covered");
    expect(requirementCoverageState({ id: "REQ-2", title: "배정 조회", status: "done" }, [{ id: "REQ-2", covered: false }])).toBe("uncovered");
  });

  it("matches a report id at the beginning of a requirement title", () => {
    expect(requirementCoverageState({ id: "node-1", title: "REQ-3. Redis 상태 조회", status: "pending" }, [{ id: "REQ-3", covered: true }])).toBe("covered");
  });

  it("task namespace가 붙은 roadmap REQ id를 coverageMap의 REQ id와 연결한다", () => {
    expect(requirementCoverageState(
      { id: "task-123::REQ-3", title: "Redis 상태 조회", status: "done" },
      [{ id: "REQ-3", covered: true }],
    )).toBe("covered");
  });

  it("roadmap status와 무관하게 명시적 evidence가 없으면 매핑 없음이다", () => {
    expect(requirementCoverageState({ id: "REQ-4", title: "저장", status: "done" })).toBe("unmapped");
  });
});

describe("verificationEvidenceState", () => {
  it("undefined, false, true를 기록 전, 미실시, 확인됨으로 구분한다", () => {
    expect(verificationEvidenceState(undefined)).toBe("not-recorded");
    expect(verificationEvidenceState(false)).toBe("not-run");
    expect(verificationEvidenceState(true)).toBe("verified");
  });
});
