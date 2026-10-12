import { describe, expect, it } from "vitest";
import { taskCycleTitle } from "../src/taskTitle.js";

describe("차수별 Task 제목", () => {
  it("patch PRD의 제목에서 기능명 뒤 핵심 제목만 사용한다", () => {
    expect(taskCycleTitle(
      "2차 patch: 필터 종류가 늘어도 요청마다 필터 1개를 조회하도록 미리 대비한다. 뒤 문장은 상세 작업이다.",
      "검색 필터",
      "# PRD patch v2: 검색 필터 — 요청 필터(filterCode)별 조회\n",
    )).toBe("요청 필터(filterCode)별 조회");
  });

  it("feat PRD는 괄호 속 브랜치 설명을 제외한 기능명을 사용한다", () => {
    expect(taskCycleTitle(undefined, "기존 제목", "# PRD: 검색 필터 (feature/search-filter)\n"))
      .toBe("검색 필터");
  });
});
