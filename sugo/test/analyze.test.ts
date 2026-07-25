import { describe, expect, it } from "vitest";
import { analyzePrdMatch, extractRequirements } from "../src/analyze.js";

describe("extractRequirements", () => {
  it("REQ-N 라인에서 id와 키워드를 추출한다", () => {
    const prd = "REQ-1: 사용자는 이메일로 로그인할 수 있어야 한다.\nREQ-2: 비밀번호는 해시로 저장한다.";
    const reqs = extractRequirements(prd);
    expect(reqs.map((r) => r.id)).toEqual(["REQ-1", "REQ-2"]);
    expect(reqs[0].keywords).toContain("이메일");
    expect(reqs[0].keywords).toContain("사용자");
  });

  it("같은 REQ id가 중복되면 첫 등장만 사용한다", () => {
    const prd = "REQ-1: 첫 설명.\nREQ-1: 중복된 설명.";
    const reqs = extractRequirements(prd);
    expect(reqs.length).toBe(1);
  });

  it("REQ 태그가 없으면 빈 배열", () => {
    expect(extractRequirements("그냥 설명 텍스트입니다.")).toEqual([]);
  });
});

describe("analyzePrdMatch", () => {
  it("변경파일에 요구사항 키워드가 전부 있으면 pass", () => {
    const prd = "REQ-1: 이메일 로그인";
    const files = ["function emailLogin() { /* 이메일 로그인 구현 */ }"];
    const result = analyzePrdMatch(prd, files);
    expect(result.requirements[0].verdict).toBe("pass");
    expect(result.verdict).toBe("pass");
  });

  it("키워드가 하나도 없으면 fail", () => {
    const prd = "REQ-1: 이메일 로그인 기능을 추가한다.";
    const files = ["function unrelatedThing() {}"];
    const result = analyzePrdMatch(prd, files);
    expect(result.requirements[0].verdict).toBe("fail");
    expect(result.verdict).toBe("fail");
  });

  it("여러 요구사항 중 일부만 매치되면 전체 verdict는 partial", () => {
    const prd = "REQ-1: 이메일 로그인\nREQ-2: 비밀번호 재설정";
    const files = ["function emailLogin() { /* 이메일 로그인 */ }"];
    const result = analyzePrdMatch(prd, files);
    expect(result.requirements.find((r) => r.id === "REQ-1")?.verdict).toBe("pass");
    expect(result.requirements.find((r) => r.id === "REQ-2")?.verdict).toBe("fail");
    expect(result.verdict).toBe("partial");
  });

  it("REQ가 전혀 파싱되지 않으면 안전측 fail", () => {
    const result = analyzePrdMatch("요구사항 태그 없는 PRD", ["아무 내용"]);
    expect(result.verdict).toBe("fail");
    expect(result.requirements).toEqual([]);
  });

  it("추출된 키워드가 0개인 요구사항은 관대하게 pass 처리한다", () => {
    const prd = "REQ-1:";
    const result = analyzePrdMatch(prd, []);
    expect(result.requirements[0].verdict).toBe("pass");
  });
});
