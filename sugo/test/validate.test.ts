import { describe, expect, it } from "vitest";
import { computeValidationVerdict } from "../src/validate.js";
import type { HarnessValidationConfig } from "../src/harness/validationConfig.js";

function configs(...entries: HarnessValidationConfig[]): Map<string, HarnessValidationConfig> {
  return new Map(entries.map((e) => [e.harnessId, e]));
}

const TS_CONFIG: HarnessValidationConfig = {
  harnessId: "lang/typescript",
  checks: [
    { id: "no-any", description: "any 금지", severity: "warning", auto: null },
    { id: "typecheck-passes", description: "tsc 통과", severity: "error", auto: null },
  ],
};

describe("computeValidationVerdict — 반드시 거부(전체 verdict가 낮아짐)", () => {
  it("error 심각도 체크가 실패하면 전체 verdict는 fail", () => {
    const result = computeValidationVerdict(
      [
        { harnessId: "lang/typescript", checkId: "no-any", passed: true },
        { harnessId: "lang/typescript", checkId: "typecheck-passes", passed: false },
      ],
      configs(TS_CONFIG),
    );
    expect(result.verdict).toBe("fail");
  });

  it("warning 심각도만 실패하면 partial(fail 아님)", () => {
    const result = computeValidationVerdict(
      [
        { harnessId: "lang/typescript", checkId: "no-any", passed: false },
        { harnessId: "lang/typescript", checkId: "typecheck-passes", passed: true },
      ],
      configs(TS_CONFIG),
    );
    expect(result.verdict).toBe("partial");
  });

  it("존재하지 않는 checkId를 보고하면 fabricated로 분리하고 판정에 반영하지 않는다", () => {
    const result = computeValidationVerdict(
      [
        { harnessId: "lang/typescript", checkId: "no-any", passed: true },
        { harnessId: "lang/typescript", checkId: "typecheck-passes", passed: true },
        { harnessId: "lang/typescript", checkId: "존재하지-않는-체크", passed: true },
      ],
      configs(TS_CONFIG),
    );
    expect(result.fabricated.length).toBe(1);
    expect(result.fabricated[0].checkId).toBe("존재하지-않는-체크");
    expect(result.results.length).toBe(2);
    expect(result.verdict).toBe("pass");
  });

  it("정의되지 않은 harnessId 전체를 보고해도 fabricated로 분리된다", () => {
    const result = computeValidationVerdict(
      [{ harnessId: "framework/nonexistent", checkId: "whatever", passed: true }],
      configs(TS_CONFIG),
    );
    expect(result.fabricated.length).toBe(1);
    expect(result.results.length).toBe(0);
    // 아무 것도 검증 안 됐으니 pass로 자동 승격되면 안 됨 — 다만 현재 구현은 results가 비면
    // failedErrors/failedWarnings도 비어 pass가 된다. 이는 "검증을 아예 안 했다"와
    // "전부 통과했다"를 구분 못 하는 한계 — uncoveredChecks로 이를 드러낸다.
    expect(result.uncoveredChecks.length).toBe(2);
  });
});

describe("computeValidationVerdict — 반드시 허용", () => {
  it("정의된 모든 체크가 통과하면 pass", () => {
    const result = computeValidationVerdict(
      [
        { harnessId: "lang/typescript", checkId: "no-any", passed: true },
        { harnessId: "lang/typescript", checkId: "typecheck-passes", passed: true },
      ],
      configs(TS_CONFIG),
    );
    expect(result.verdict).toBe("pass");
    expect(result.uncoveredChecks).toEqual([]);
  });

  it("제출이 없으면 uncoveredChecks에 정의된 체크가 전부 나열된다", () => {
    const result = computeValidationVerdict([], configs(TS_CONFIG));
    expect(result.uncoveredChecks.length).toBe(2);
    expect(result.verdict).toBe("pass");
  });
});
