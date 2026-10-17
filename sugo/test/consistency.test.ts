import { describe, expect, it } from "vitest";
import { checkCoverageGate, type CoverageMap } from "../src/consistency.js";

function baseMap(overrides: Partial<CoverageMap> = {}): CoverageMap {
  return {
    acceptanceCriteria: [{ id: "AC-1", covered: true }],
    responseFields: [{ field: "email", asserted: true }],
    integrationTestCount: 1,
    regressionChecked: false,
    regressionIntact: false,
    ...overrides,
  };
}

describe("checkCoverageGate — 적대적 코퍼스: 반드시 거부", () => {
  it("응답필드 asserted:false가 있으면 거부한다", () => {
    const result = checkCoverageGate(baseMap({ responseFields: [{ field: "token", asserted: false }] }));
    expect(result.ok).toBe(false);
    expect(result.code).toBe("PRD_COVERAGE_INCOMPLETE");
  });

  it("AC covered:false가 있으면 거부한다(구현이 빠뜨린 필드)", () => {
    const result = checkCoverageGate(baseMap({ acceptanceCriteria: [{ id: "AC-2", covered: false }] }));
    expect(result.ok).toBe(false);
    expect(result.code).toBe("PRD_COVERAGE_INCOMPLETE");
  });

  it("regressionChecked:true인데 regressionIntact가 true가 아니면 거부한다(확인했지만 결과 안 밝힘)", () => {
    const result = checkCoverageGate(baseMap({ regressionChecked: true, regressionIntact: false }));
    expect(result.ok).toBe(false);
    expect(result.code).toBe("REGRESSION_NOT_INTACT");
  });

  it("통합레벨 테스트가 0개면 거부한다", () => {
    const result = checkCoverageGate(baseMap({ integrationTestCount: 0 }));
    expect(result.ok).toBe(false);
    expect(result.code).toBe("INTEGRATION_TEST_MISSING");
  });
});

describe("checkCoverageGate — 반드시 허용", () => {
  it("모든 AC covered, 모든 응답필드 asserted, 통합테스트 ≥1이면 통과한다", () => {
    expect(checkCoverageGate(baseMap()).ok).toBe(true);
  });

  it("regressionChecked와 regressionIntact 둘 다 true면 통과한다", () => {
    expect(checkCoverageGate(baseMap({ regressionChecked: true, regressionIntact: true })).ok).toBe(true);
  });

  it("애초에 regressionChecked를 안 했으면(회귀 확인을 주장하지 않음) 통과한다", () => {
    expect(checkCoverageGate(baseMap({ regressionChecked: false, regressionIntact: false })).ok).toBe(true);
  });
});
