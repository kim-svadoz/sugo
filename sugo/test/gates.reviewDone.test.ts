import { describe, expect, it } from "vitest";
import { checkRuntimeVerificationGate, checkUserConfirmationGate, validateSummaryQuality } from "../src/gates.js";

describe("checkUserConfirmationGate — 설계안", () => {
  it("userConfirmed 없음/false로 review_done을 부르면 거부한다", () => {
    const result = checkUserConfirmationGate(false);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("USER_CONFIRMATION_REQUIRED");
  });

  it("사람에게 확인받은 뒤 userConfirmed:true면 통과한다", () => {
    expect(checkUserConfirmationGate(true).ok).toBe(true);
  });
});

describe("validateSummaryQuality — 설계안: 반드시 거부", () => {
  it("3줄 미만이면 거부한다", () => {
    const result = validateSummaryQuality("한 줄짜리 요약인데 길이는 서른자를 넘도록 충분히 길게 작성했습니다.");
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("SUMMARY_TOO_FEW_LINES");
  });

  it("30자 미만이면 거부한다", () => {
    const result = validateSummaryQuality("짧음\n두번째\n세번째");
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("SUMMARY_TOO_SHORT");
  });

  it("고유문자가 10 미만인 반복문자 패딩은 거부한다(char diversity)", () => {
    const padded = ["aa bb cc dd ee", "aa bb cc dd ee", "aa bb cc dd ee"].join("\n");
    const result = validateSummaryQuality(padded);
    expect(result.uniqueChars).toBeLessThan(10);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("SUMMARY_LOW_CHAR_DIVERSITY");
  });

  it("구별토큰이 5 미만인 반복 패딩은 거부한다(token diversity)", () => {
    const padded = ["가나다라마바사아자차", "가나다라마바사아자차", "가나다라마바사아자차"].join("\n");
    const result = validateSummaryQuality(padded);
    expect(result.uniqueChars).toBeGreaterThanOrEqual(10);
    expect(result.distinctTokens).toBeLessThan(5);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("SUMMARY_LOW_TOKEN_DIVERSITY");
  });

  it("스펙 예시 그대로(aaaa/bbbb/cccc류 패딩)도 거부한다", () => {
    const padded = ["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc"].join("\n");
    const result = validateSummaryQuality(padded);
    expect(result.ok).toBe(false);
  });
});

describe("validateSummaryQuality — 반드시 허용", () => {
  it("배경/변경/설계/테스트 4줄 정상 요약은 통과한다", () => {
    const summary = [
      "배경: 사용자가 이메일로 로그인할 수 없는 문제가 있었다.",
      "변경: EmailLoginService를 추가하고 컨트롤러에 연결했다.",
      "설계: 기존 인증 흐름을 재사용하며 비밀번호 해시는 bcrypt를 사용했다.",
      "테스트: 단위테스트 12개와 통합테스트 2개를 추가해 전부 통과를 확인했다.",
    ].join("\n");
    const result = validateSummaryQuality(summary);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("checkRuntimeVerificationGate — 설계안: 반드시 거부", () => {
  it("runtimeVerified:false인데 환경부재 라벨이 없으면 거부한다", () => {
    const result = checkRuntimeVerificationGate("pass", { buildAttempted: true, testRun: true, runtimeVerified: false }, false);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("RUNTIME_UNVERIFIED_GATE_FAILED");
  });

  it("testPassedState=fail인데 runtimeVerified:true 주장이면 자기보고를 무시하고 거부한다", () => {
    const result = checkRuntimeVerificationGate("fail", { buildAttempted: true, testRun: true, runtimeVerified: true }, false);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("RUNTIME_CLAIM_CONTRADICTS_EVIDENCE");
  });

  it("부팅 가능 스택인데 wiringVerified가 없으면 거부한다", () => {
    const result = checkRuntimeVerificationGate(
      "pass",
      { buildAttempted: true, testRun: true, runtimeVerified: true, wiringVerified: false },
      true,
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("RUNTIME_WIRING_NOT_VERIFIED");
  });
});

describe("checkRuntimeVerificationGate — 반드시 허용", () => {
  it("실제 빌드/테스트가 그린이면 통과한다", () => {
    const result = checkRuntimeVerificationGate("pass", { buildAttempted: true, testRun: true, runtimeVerified: true }, false);
    expect(result.ok).toBe(true);
  });

  it("환경부재를 라벨로 명시하면 runtimeVerified:false여도 통과한다", () => {
    const result = checkRuntimeVerificationGate(
      "unverified",
      { buildAttempted: false, testRun: false, runtimeVerified: false, unverifiedReason: "샌드박스에 런타임 없음" },
      false,
    );
    expect(result.ok).toBe(true);
  });

  it("부팅 가능 스택이어도 wiringVerified:true면 통과한다", () => {
    const result = checkRuntimeVerificationGate(
      "pass",
      { buildAttempted: true, testRun: true, runtimeVerified: true, wiringVerified: true },
      true,
    );
    expect(result.ok).toBe(true);
  });
});
