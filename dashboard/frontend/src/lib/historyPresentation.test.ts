import { describe, expect, it } from "vitest";
import { historyDisplayTitle } from "./historyPresentation.js";

describe("History 표시 제목", () => {
  it("포괄적인 작업명 대신 요약의 첫 핵심 문장을 사용한다", () => {
    expect(historyDisplayTitle({
      task_title: "검색 필터",
      summary: "검색 필터 모듈은 alias로 최신 문서를 조회한다.\n검증도 완료했다.",
      id: "wl-1",
    })).toBe("검색 필터 모듈은 alias로 최신 문서를 조회한다.");
  });

  it("Markdown 제목과 작업 요약 라벨을 제거한다", () => {
    expect(historyDisplayTitle({
      task_title: "favorite-items",
      summary: "## 작업 요약\n\n- 빈 검색 결과는 전체 범위로 다시 조회한다.",
      id: "wl-2",
    })).toBe("빈 검색 결과는 전체 범위로 다시 조회한다.");
  });

  it("요약이 없으면 기존 작업명과 id 순서로 안전하게 대체한다", () => {
    expect(historyDisplayTitle({ task_title: "모델 교체", summary: null, id: "wl-3" })).toBe("모델 교체");
    expect(historyDisplayTitle({ task_title: null, summary: null, id: "wl-4" })).toBe("wl-4");
  });
});
