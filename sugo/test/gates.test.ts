import { describe, expect, it } from "vitest";
import {
  checkAnalyzeGate,
  checkBaselineGate,
  checkBootGate,
  checkRegistrationGlueGate,
  checkWiringGate,
  detectBaselineSignals,
  hasValidSpringBootTestAnnotation,
  isWiringChange,
  validatePrd,
} from "../src/gates.js";

const LONG_ENOUGH_TEXT = "가".repeat(90);

describe("validatePrd (설계안: 본문 ≥100자, REQ ≥1) — 반드시 거부", () => {
  it("100자 미만이면 거부한다", () => {
    const result = validatePrd("REQ-1: 짧은 PRD");
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("PRD_TOO_SHORT");
  });

  it("길이는 충분해도 REQ 태그가 없으면 거부한다", () => {
    const result = validatePrd(`이 PRD는 충분히 길지만 요구사항 태그가 전혀 없습니다. ${LONG_ENOUGH_TEXT}`);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain("PRD_MISSING_REQUIREMENTS");
  });
});

describe("validatePrd — 반드시 허용", () => {
  it("100자 이상 + REQ-1 이상이면 통과한다", () => {
    const content = `REQ-1: 사용자는 로그인할 수 있어야 한다. ${LONG_ENOUGH_TEXT}`;
    const result = validatePrd(content);
    expect(result.ok).toBe(true);
    expect(result.reqCount).toBe(1);
  });

  it("중복 REQ 태그는 하나로 센다", () => {
    const content = `REQ-1: 첫 요구사항. REQ-1: 같은 태그 반복. ${LONG_ENOUGH_TEXT}`;
    const result = validatePrd(content);
    expect(result.reqCount).toBe(1);
  });
});

describe("detectBaselineSignals (§4.0)", () => {
  it("JDK 상향 시그널을 감지한다", () => {
    const result = detectBaselineSignals("이번 작업은 JDK 버전을 상향합니다.");
    expect(result.required).toBe(true);
    expect(result.signals).toContain("jdk-runtime-upgrade");
  });

  it("의존성 제거 시그널을 감지한다", () => {
    const result = detectBaselineSignals("불필요한 라이브러리 의존성을 제거합니다.");
    expect(result.required).toBe(true);
    expect(result.signals).toContain("dependency-removal");
  });

  it("시그널이 없으면 required:false (no-op)", () => {
    const result = detectBaselineSignals("버튼 색상을 파란색으로 바꿉니다.");
    expect(result.required).toBe(false);
    expect(result.signals).toEqual([]);
  });
});

describe("checkBaselineGate — 반드시 거부", () => {
  it("required인데 baseline 증거가 없으면 거부한다", () => {
    const result = checkBaselineGate(true, null);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("BASELINE_NOT_GREEN");
  });

  it("required인데 exitCode가 0이 아니면 거부한다", () => {
    const result = checkBaselineGate(true, 1);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("BASELINE_NOT_GREEN");
  });
});

describe("checkBaselineGate — 반드시 허용", () => {
  it("required가 아니면 no-op 통과", () => {
    expect(checkBaselineGate(false, null).ok).toBe(true);
  });

  it("required이고 exitCode 0이면 통과", () => {
    expect(checkBaselineGate(true, 0).ok).toBe(true);
  });
});

describe("checkAnalyzeGate — 반드시 거부/허용", () => {
  it("PRD 세션인데 analyze 호출 이력이 0이면 거부한다", () => {
    const result = checkAnalyzeGate(0, true);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("ANALYZE_NOT_CALLED");
  });

  it("analyze를 1회 이상 호출했으면 통과한다(3회 소진 후 partial/fail이어도 허용)", () => {
    expect(checkAnalyzeGate(1, true).ok).toBe(true);
    expect(checkAnalyzeGate(3, true).ok).toBe(true);
  });

  it("PRD가 없는 세션은 no-op 통과", () => {
    expect(checkAnalyzeGate(0, false).ok).toBe(true);
  });
});

describe("isWiringChange / checkWiringGate", () => {
  it("application.yml 변경을 배선 변경으로 감지한다", () => {
    expect(isWiringChange(["src/main/resources/application.yml"])).toBe(true);
  });

  it("*Configuration.java 변경을 배선 변경으로 감지한다", () => {
    expect(isWiringChange(["src/main/java/com/x/DataSourceConfiguration.java"])).toBe(true);
  });

  it("무관한 파일만 바뀌면 배선 변경이 아니다", () => {
    expect(isWiringChange(["src/main/java/com/x/UserService.java"])).toBe(false);
  });

  it("배선 변경인데 wiringTestAdded가 false면 거부한다", () => {
    const result = checkWiringGate(["application.yml"], "plan", false);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("WIRING_TEST_MISSING");
  });

  it("patch 모드면 배선 파일 변경이 없어도 트리거되어 거부한다", () => {
    const result = checkWiringGate(["UserService.java"], "patch", false);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("WIRING_TEST_MISSING");
  });

  it("배선 변경 없음 + plan 모드면 통과한다", () => {
    expect(checkWiringGate(["UserService.java"], "plan", false).ok).toBe(true);
  });

  it("배선 변경이 있어도 wiringTestAdded가 true면 통과한다", () => {
    expect(checkWiringGate(["application.yml"], "plan", true).ok).toBe(true);
  });
});

describe("checkRegistrationGlueGate", () => {
  it("의존성 제거인데 글루 diff 미점검이면 거부한다", () => {
    const result = checkRegistrationGlueGate(true, false);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("REGISTRATION_GLUE_NOT_CHECKED");
  });

  it("의존성 제거가 없으면 no-op 통과", () => {
    expect(checkRegistrationGlueGate(false, false).ok).toBe(true);
  });

  it("의존성 제거 + 글루 점검 완료면 통과", () => {
    expect(checkRegistrationGlueGate(true, true).ok).toBe(true);
  });
});

describe("hasValidSpringBootTestAnnotation — 설계안: 반드시 거부", () => {
  it("주석 속 @SpringBootTest는 인정하지 않는다", () => {
    const content = "// @SpringBootTest\nclass FooTest {}";
    expect(hasValidSpringBootTestAnnotation([content])).toBe(false);
  });

  it("문자열 리터럴(ArchUnit 등) 속 @SpringBootTest는 인정하지 않는다", () => {
    const content = 'String rule = "@SpringBootTest 클래스는 xxx 패키지에 있어야 한다";';
    expect(hasValidSpringBootTestAnnotation([content])).toBe(false);
  });

  it("슬라이스 테스트(@WebMvcTest)만 있으면 인정하지 않는다", () => {
    const content = "@WebMvcTest(UserController.class)\nclass UserControllerTest {}";
    expect(hasValidSpringBootTestAnnotation([content])).toBe(false);
  });
});

describe("hasValidSpringBootTestAnnotation — 설계안: 반드시 허용", () => {
  it("줄 첫 비공백이 @SpringBootTest인 실제 어노테이션은 인정한다", () => {
    const content = "@SpringBootTest\nclass AppContextLoadTest {}";
    expect(hasValidSpringBootTestAnnotation([content])).toBe(true);
  });

  it("들여쓰기된 @SpringBootTest도 인정한다", () => {
    const content = "package x;\n\n    @SpringBootTest\n    class Foo {}";
    expect(hasValidSpringBootTestAnnotation([content])).toBe(true);
  });
});

describe("checkBootGate", () => {
  it("부팅 불가 스택이면 no-op 통과", () => {
    expect(checkBootGate(false, false).ok).toBe(true);
  });

  it("부팅 가능한데 어노테이션도 없고 라벨도 없으면 거부한다", () => {
    const result = checkBootGate(true, false);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("BOOT_GATE_FAILED");
  });

  it("부팅 가능 + 어노테이션 발견이면 통과", () => {
    expect(checkBootGate(true, true).ok).toBe(true);
  });

  it("부팅 가능 + 환경부재 라벨이면 통과(우회는 라벨로만)", () => {
    expect(checkBootGate(true, false, "CI 환경에 JDK 미설치").ok).toBe(true);
  });

  it("빈 문자열 라벨은 우회로 인정하지 않는다", () => {
    expect(checkBootGate(true, false, "   ").ok).toBe(false);
  });
});
