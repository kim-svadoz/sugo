import { fail, ok, type GateCheckResult } from "./gates.js";

export interface AcceptanceCriterionCoverage {
  id: string;
  covered: boolean;
}

export interface ResponseFieldCoverage {
  field: string;
  asserted: boolean;
}

export interface CoverageMap {
  acceptanceCriteria: AcceptanceCriterionCoverage[];
  responseFields: ResponseFieldCoverage[];
  integrationTestCount: number;
  regressionChecked: boolean;
  regressionIntact: boolean;
}

/**
 * §10 PRD 정합성 게이트(선택 확장) — 커버리지맵(AC·응답필드 어서션) + 회귀 대조 + 통합레벨.
 * 안전측 기본값 = 차단: AC/응답필드가 하나라도 빠지면 거부, "회귀 확인했다는데 결과가 true가
 * 아니면"(명시적 false든 미기재든) 거부한다 — 적대적 코퍼스 "확인했지만 결과 안 밝힘"과 동일 원리.
 * regressionChecked 자체를 안 했으면(회귀 확인을 주장하지 않았으면) no-op으로 통과시킨다 —
 * 이 게이트는 회귀 확인을 강제하지 않고, "확인했다고 자기보고했으면 정직해야 한다"만 강제한다.
 */
export function checkCoverageGate(coverageMap: CoverageMap): GateCheckResult {
  const uncoveredAC = coverageMap.acceptanceCriteria.filter((ac) => !ac.covered);
  if (uncoveredAC.length > 0) {
    return fail(
      "PRD_COVERAGE_INCOMPLETE",
      `AC(수락기준) 미충족: ${uncoveredAC.map((a) => a.id).join(", ")}`,
    );
  }

  const unassertedFields = coverageMap.responseFields.filter((f) => !f.asserted);
  if (unassertedFields.length > 0) {
    return fail(
      "PRD_COVERAGE_INCOMPLETE",
      `응답필드 미검증: ${unassertedFields.map((f) => f.field).join(", ")}`,
    );
  }

  if (coverageMap.regressionChecked && !coverageMap.regressionIntact) {
    return fail(
      "REGRESSION_NOT_INTACT",
      "회귀 확인을 주장했지만 결과가 intact:true가 아닙니다(깨졌거나 결과를 명확히 밝히지 않음).",
    );
  }

  if (coverageMap.integrationTestCount < 1) {
    return fail("INTEGRATION_TEST_MISSING", "통합레벨 테스트가 최소 1개 필요합니다.");
  }

  return ok();
}
