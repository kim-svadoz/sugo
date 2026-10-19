import { describe, expect, it } from "vitest";
import { validateConformanceLedger } from "../src/gates.js";

/**
 * `CONFORMANCE_LEDGER_INCOMPLETE` — prd 차단.
 *
 * PRD에 In-Scope/DoD 항목을 적어놓고 그 중 일부를 REQ로 승격하지 않으면, 그 항목은 **아무
 * 게이트도 통과하지 않은 채 "하기로 한 일"로만 남는다.** 로드맵 subtask로 심기지 않으니
 * 진행률에도 안 잡히고, review_done의 PRD 커버리지 대조에도 안 걸린다 — 조용히 증발한다.
 * 그래서 원장(ledger) 항목과 REQ가 1:1로 맞물릴 때만 통과시킨다.
 */
describe("validateConformanceLedger", () => {
  const withReqs = "### REQ-001: 이메일 로그인\n### REQ-002: 소셜 로그인\n";

  it("허용: 원장 섹션이 아예 없으면 no-op(레거시 PRD 하위호환)", () => {
    expect(validateConformanceLedger("본문만 있는 PRD\n" + withReqs).ok).toBe(true);
  });

  it("허용: In-Scope 항목이 전부 REQ를 참조한다", () => {
    const prd = `## In-Scope
- 이메일 로그인 (REQ-001)
- 소셜 로그인 (REQ-002)

## DoD
- REQ-001 통합테스트 통과
- REQ-002 통합테스트 통과

${withReqs}`;
    expect(validateConformanceLedger(prd).ok).toBe(true);
  });

  it("거부: In-Scope 항목 하나가 REQ에 안 걸려 있다", () => {
    const prd = `## In-Scope
- 이메일 로그인 (REQ-001)
- 비밀번호 재설정 메일

${withReqs}`;
    const r = validateConformanceLedger(prd);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("CONFORMANCE_LEDGER_INCOMPLETE");
    expect(r.message).toContain("비밀번호 재설정 메일");
  });

  it("거부: DoD 항목이 REQ 미매핑", () => {
    const prd = `## DoD
- REQ-001 통합테스트 통과
- 운영 대시보드에 지표 노출

${withReqs}`;
    expect(validateConformanceLedger(prd).code).toBe("CONFORMANCE_LEDGER_INCOMPLETE");
  });

  it("거부: 존재하지 않는 REQ 번호를 참조한다(오타·유령 참조)", () => {
    const prd = `## In-Scope
- 이메일 로그인 (REQ-009)

${withReqs}`;
    const r = validateConformanceLedger(prd);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("REQ-009");
  });

  it("허용: 섹션 헤딩 표기 흔들림(범위/Scope/완료 조건)도 인식한다", () => {
    const prd = `## 범위(In-Scope)
- 이메일 로그인 (REQ-001)

## 완료 조건(DoD)
- REQ-002 통과

${withReqs}`;
    expect(validateConformanceLedger(prd).ok).toBe(true);
  });

  it("허용: 빈 불릿·주석 줄은 항목으로 세지 않는다", () => {
    const prd = `## In-Scope
-
- 이메일 로그인 (REQ-001)

${withReqs}`;
    expect(validateConformanceLedger(prd).ok).toBe(true);
  });

  it("허용: Out-of-Scope는 REQ 매핑 대상이 아니다(안 하기로 한 일)", () => {
    const prd = `## Out-of-Scope
- SAML SSO
- LDAP 연동

## In-Scope
- 이메일 로그인 (REQ-001)

${withReqs}`;
    expect(validateConformanceLedger(prd).ok).toBe(true);
  });
});
