import { describe, expect, it } from "vitest";
import { historyContextTitle, historyDisplayDate, historyDisplayTitle } from "./historyPresentation.js";

describe("History 표시 제목", () => {
  it("포괄적인 작업명 대신 요약의 첫 핵심 문장을 사용한다", () => {
    expect(historyDisplayTitle({
      task_title: "할 일 추가",
      summary: "할 일 추가 화면은 빈 제목을 저장하지 않는다.\n검증도 완료했다.",
      id: "wl-1",
    })).toBe("할 일 추가 화면은 빈 제목을 저장하지 않는다.");
  });

  it("Markdown 제목과 작업 요약 라벨을 제거한다", () => {
    expect(historyDisplayTitle({
      task_title: "todo-empty-list",
      summary: "## 작업 요약\n\n- 빈 할 일 목록에는 안내 문구를 보인다.",
      id: "wl-2",
    })).toBe("빈 할 일 목록에는 안내 문구를 보인다.");
  });

  it("요약이 없으면 기존 작업명과 id 순서로 안전하게 대체한다", () => {
    expect(historyDisplayTitle({ task_title: "공지 목록", summary: null, id: "wl-3" })).toBe("공지 목록");
    expect(historyDisplayTitle({ task_title: null, summary: null, id: "wl-4" })).toBe("wl-4");
  });

  it("Git 가져오기 안내문을 모든 이력의 제목처럼 반복하지 않는다", () => {
    expect(historyDisplayTitle({
      task_title: "feat: add schedule memo",
      summary: "Sugo 파이프라인 외부에서 수행한 Git 저장소 이력입니다.",
      id: "git:abc123",
    })).toBe("feat: add schedule memo");
  });

  it("현재 SPEC 제목을 저장 당시 작업명보다 우선한다", () => {
    expect(historyContextTitle({ spec_title: "수정한 SPEC 제목", task_title: "등록 당시 제목" })).toBe("수정한 SPEC 제목");
    expect(historyContextTitle({ spec_title: null, task_title: "등록 당시 제목" })).toBe("등록 당시 제목");
  });

  it("날짜를 연월일이 명확한 한국어 형식으로 표시한다", () => {
    expect(historyDisplayDate("2026-10-08 06:04:23")).toBe("2026년 10월 8일");
    expect(historyDisplayDate(null)).toBe("—");
  });
});
