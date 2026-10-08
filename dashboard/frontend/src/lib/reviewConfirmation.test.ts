import { describe, expect, it } from "vitest";
import { reviewConfirmationSections } from "./reviewConfirmation.js";

describe("reviewConfirmationSections", () => {
  it("빈 섹션을 숨기고 사람이 읽을 순서로 정리한다", () => {
    expect(reviewConfirmationSections({
      summary: "조회 로직을 수정했습니다.",
      changes: ["쿼리 조건 수정"],
      tests: ["37/37 통과"],
      designDecisions: [],
      knownLimitations: ["시뮬레이터 미실행"],
    })).toEqual([
      { id: "summary", title: "작업 요약", items: ["조회 로직을 수정했습니다."] },
      { id: "changes", title: "변경 내용", items: ["쿼리 조건 수정"] },
      { id: "tests", title: "검증 결과", items: ["37/37 통과"] },
      { id: "knownLimitations", title: "알려진 한계", items: ["시뮬레이터 미실행"] },
    ]);
  });
});
