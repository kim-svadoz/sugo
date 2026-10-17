import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { taskCycleTitle } from "../src/taskTitle.js";

describe("차수별 Task 제목", () => {
  it("patch PRD의 제목에서 기능명 뒤 핵심 제목만 사용한다", () => {
    expect(taskCycleTitle(
      "2차 patch: 필터 종류가 늘어도 요청마다 필터 1개를 조회하도록 미리 대비한다. 뒤 문장은 상세 작업이다.",
      "검색필터",
      "# PRD patch v2: 검색필터 — 요청 필터(filterCode)별 조회\n",
    )).toBe("요청 필터(filterCode)별 조회");
  });

  it("feat PRD는 괄호 속 브랜치 설명을 제외한 기능명을 사용한다", () => {
    expect(taskCycleTitle(undefined, "기존 제목", "# PRD: 검색필터 (feature/search-filter)\n"))
      .toBe("검색필터");
  });

  it("완료 요약에서는 기능명보다 실제 수행한 첫 문장을 제목으로 사용한다", () => {
    expect(taskCycleTitle(
      "검색필터 모듈은 날짜 인덱스 대신 alias로 최신 문서를 조회한다. 이후 문장은 상세 검증이다.",
      "검색필터",
    )).toBe("검색필터 모듈은 날짜 인덱스 대신 alias로 최신 문서를 조회한다.");
  });

  it("완료 History 저장도 review 요약에서 구체적인 제목을 만든다", () => {
    const source = readFileSync(new URL("../src/tools/sugoPlan.ts", import.meta.url), "utf8");
    expect(source).toContain("task_title: taskCycleTitle(session.data.chainInfo.reviewSummary, session.featureName)");
    expect(source).not.toContain("task_title: session.featureName");
  });
});
