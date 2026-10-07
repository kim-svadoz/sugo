import { describe, expect, it } from "vitest";
import { workResultPresentation } from "./workResultPresentation.js";

describe("workResultPresentation", () => {
  it("사람 승인 등급은 자동 검증과 다르게 표시한다", () => {
    const result = workResultPresentation({ schemaVersion: 1, kind: "feat", patchVersion: 0,
      completionGrade: "verified_by_human", summary: "요약", changedFiles: [], designDecisions: [], knownLimitations: [],
      verification: { test: { state: "pass" }, runtimeVerified: true } });
    expect(result.gradeLabel).toBe("사람 승인 검증완료");
    expect(result.grade).toBe("verified_by_human");
  });
  it("구조화된 report를 Canvas 카드용 정보로 바꾼다", () => {
    const result = workResultPresentation({
      schemaVersion: 1,
      kind: "patch",
      patchVersion: 1,
      completionGrade: "verified",
      summary: "Redis 기반 중복 결제 차단",
      changedFiles: ["CheckoutService.ts"],
      designDecisions: ["기존 Redis 경계 재사용"],
      knownLimitations: [],
      verification: {
        test: { command: "npm test", state: "pass", total: 12, passed: 12, failed: 0 },
        runtimeVerified: true,
        wiringVerified: true,
        validationVerdict: "pass",
      },
    });
    expect(result.versionLabel).toBe("v1 patch");
    expect(result.gradeLabel).toBe("검증 완료");
    expect(result.testLabel).toBe("12/12 통과");
    expect(result.sections).toEqual(expect.arrayContaining([expect.objectContaining({ title: "설계 결정" })]));
  });

  it("legacy summary만 있어도 화면이 깨지지 않는다", () => {
    const result = workResultPresentation({ summary: "기존 작업 요약이다. 다음 행동을 확인한다." });
    expect(result.versionLabel).toBe("작업 결과");
    expect(result.summary).toBe("기존 작업 요약이다.\n\n다음 행동을 확인한다.");
  });
});
