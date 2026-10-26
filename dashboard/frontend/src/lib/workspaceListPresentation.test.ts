import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../pages/Sessions.tsx", import.meta.url), "utf8");

describe("도메인 목록 표현", () => {
  it("상태와 지표를 한글로 명확하게 표시한다", () => {
    expect(source).toContain('text: "진행 중"');
    expect(source).toContain('text: "완료"');
    expect(source).toContain('text: "대기"');
    expect(source).toContain("완료율 {health}%");
    expect(source).not.toContain("% health");
    expect(source).toContain("작업 이력 검색");
    expect(source).toContain("전체 도메인");
    expect(source).toContain("도메인 추가");
  });

  it("화면 안내에서 목록 수치와 클릭 결과를 설명한다", () => {
    expect(source).toContain("화면 안내");
    expect(source).toContain("도메인 목록 보는 법");
    expect(source).toContain("완료한 작업 / 등록된 작업");
    expect(source).toContain("행을 누르면 해당 도메인의 작업장과 최근 결과를 볼 수 있습니다.");
  });
});
