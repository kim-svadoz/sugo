import { describe, expect, it } from "vitest";
import { checkJiraOption, checkOracleDone, checkSpecOracleGate } from "../src/gates.js";

/**
 * `SPEC_ORACLE_NOT_RUN`·oracle_done·jira 게이트. 순수 함수 + mock 없음.
 *
 * 이 게이트의 존재 이유: PRD를 썼다고 해서 **기준 스펙 문서를 실제로 대조했다는 뜻은
 * 아니다.** 대조 없이 ready로 넘어가면 "PRD에 없는 요구사항"이 조용히 누락된 채 코딩이 시작된다.
 * oracle_done은 그 대조를 **했다는 기록**이고, 안 했으면 ready가 막힌다.
 */
describe("SPEC_ORACLE_NOT_RUN — ready 차단", () => {
  it("거부: 오라클이 required인데 미실행 상태로 ready", () => {
    const r = checkSpecOracleGate({ required: true, ran: false });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("SPEC_ORACLE_NOT_RUN");
  });

  it("허용: required인데 oracle_done으로 기록됨", () => {
    expect(checkSpecOracleGate({ required: true, ran: true }).ok).toBe(true);
  });

  it("허용: 기준 스펙 문서가 없어 required가 아니면 no-op 통과", () => {
    expect(checkSpecOracleGate({ required: false, ran: false }).ok).toBe(true);
  });

  it("허용: specOracle 자체가 없는 레거시 세션은 통과(하위호환)", () => {
    expect(checkSpecOracleGate(undefined).ok).toBe(true);
  });
});

describe("oracle_done — 미커버 항목엔 사유 강제", () => {
  it("거부: uncovered가 있는데 overrideReason 없음", () => {
    const r = checkOracleDone([{ quote: "스펙 3.2 절 응답에 traceId 포함", reason: "PRD에 누락" }], undefined);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("ORACLE_OVERRIDE_REASON_REQUIRED");
  });

  it("거부: overrideReason이 공백뿐", () => {
    const r = checkOracleDone([{ quote: "q", reason: "r" }], "   ");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("ORACLE_OVERRIDE_REASON_REQUIRED");
  });

  it("허용: uncovered가 있어도 사유를 밝히면 진행(정직한 탈출구)", () => {
    expect(checkOracleDone([{ quote: "q", reason: "r" }], "다음 버전에서 처리하기로 합의함").ok).toBe(true);
  });

  it("허용: 전부 커버됐으면 사유 불필요", () => {
    expect(checkOracleDone([], undefined).ok).toBe(true);
    expect(checkOracleDone(undefined, undefined).ok).toBe(true);
  });
});

describe("jira — 옵션 강제", () => {
  it("거부: jiraOption 미지정", () => {
    const r = checkJiraOption(undefined, undefined);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("JIRA_OPTION_REQUIRED");
  });

  it("거부: link인데 jiraKey 없음", () => {
    const r = checkJiraOption("link", undefined);
    expect(r.ok).toBe(false);
    expect(r.code).toBe("JIRA_KEY_REQUIRED");
  });

  it("거부: link인데 jiraKey가 공백뿐", () => {
    expect(checkJiraOption("link", "  ").code).toBe("JIRA_KEY_REQUIRED");
  });

  it("허용: skip / new / link+key", () => {
    expect(checkJiraOption("skip", undefined).ok).toBe(true);
    expect(checkJiraOption("new", undefined).ok).toBe(true);
    expect(checkJiraOption("link", "PROJ-123").ok).toBe(true);
  });
});
