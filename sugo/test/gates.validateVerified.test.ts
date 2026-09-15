import { describe, expect, it } from "vitest";
import { checkValidateCalledGate, checkValidateVerifiedGate, type LastValidation } from "../src/gates.js";

function lastValidation(overrides: Partial<LastValidation> = {}): LastValidation {
  return {
    verdict: "pass",
    checkedAt: "2026-09-15T00:00:00.000Z",
    fabricatedCount: 0,
    contradictionCount: 0,
    autoVerifiedCount: 3,
    verifiedFailures: [],
    ...overrides,
  };
}

describe("checkValidateCalledGate — sugo_validate 호출강제(analyze 게이트와 같은 패턴)", () => {
  it("한 번도 안 불렀으면 반드시 거부한다", () => {
    const result = checkValidateCalledGate(undefined);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("VALIDATE_NOT_CALLED");
  });

  it("호출 이력만 있으면 verdict와 무관하게 통과한다(analyze 게이트와 동일 원칙)", () => {
    expect(checkValidateCalledGate(lastValidation({ verdict: "fail" })).ok).toBe(true);
    expect(checkValidateCalledGate(lastValidation({ verdict: "pass" })).ok).toBe(true);
  });
});

describe("checkValidateVerifiedGate — 실측 실패만 막는다(자기보고는 안 막음)", () => {
  it("verified 실패가 있으면 반드시 거부하고 어떤 체크인지 밝힌다", () => {
    const result = checkValidateVerifiedGate(
      lastValidation({
        verdict: "fail",
        verifiedFailures: [{ harnessId: "lang/typescript", checkId: "no-weakened-strict-config", detail: "strict = false" }],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("VALIDATE_VERIFIED_FAILURE");
    expect(result.message).toContain("no-weakened-strict-config");
    expect(result.message).toContain("strict = false");
  });

  it("verified 실패가 없으면 전체 verdict가 fail이어도 통과한다(자기보고 실패는 안 막음)", () => {
    // 91%는 여전히 자기보고다 — 실측 안 된 실패로 파이프라인을 막으면 "확인 안 함"과
    // "확인했더니 틀렸다"를 못 구분하게 된다.
    const result = checkValidateVerifiedGate(lastValidation({ verdict: "fail", verifiedFailures: [] }));
    expect(result.ok).toBe(true);
  });

  it("여러 개 실패하면 전부 나열한다", () => {
    const result = checkValidateVerifiedGate(
      lastValidation({
        verifiedFailures: [
          { harnessId: "buildtool/maven", checkId: "wrapper-committed", detail: "없는 파일: mvnw" },
          { harnessId: "framework/express/4.x", checkId: "async-errors-forwarded", detail: "미전파" },
        ],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("wrapper-committed");
    expect(result.message).toContain("async-errors-forwarded");
  });

  it("validate를 아예 안 불렀으면(undefined) 이 게이트 단독으로는 통과시킨다(호출강제는 별개 게이트)", () => {
    // 책임 분리: "안 불렀다"는 checkValidateCalledGate가, "불렀는데 실측이 실패했다"는 이 게이트가 막는다.
    expect(checkValidateVerifiedGate(undefined).ok).toBe(true);
  });
});
