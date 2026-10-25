import { describe, expect, it } from "vitest";
import { latestDevelopmentPreview } from "./scheduleDevelopmentPreview.js";

describe("latestDevelopmentPreview", () => {
  it("가장 높은 버전의 PATCH 번호와 작업 제목 한 줄만 반환한다", () => {
    expect(latestDevelopmentPreview({ development_history: [
      { version: 0, title: "첫 개발", summary: "최초 기능을 구현했습니다." },
      { version: 4, title: "후속 보완", summary: "검색 결과 정렬과 캐시 정책을 보완했습니다." },
    ] })).toEqual({ label: "PATCH 4", title: "후속 보완" });
  });

  it("버전 0은 FEAT로 표시한다", () => {
    expect(latestDevelopmentPreview({ development_history: [
      { version: 0, title: "알림 설정 API 추가", summary: null },
    ] })).toEqual({ label: "FEAT", title: "알림 설정 API 추가" });
  });

  it("완료 이력이 없으면 아직 기록이 없음을 알린다", () => {
    expect(latestDevelopmentPreview({ development_history: [] })).toBeNull();
  });
});
