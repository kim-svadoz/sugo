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
    expect(source).toContain("프로젝트 등록");
    expect(source).toContain("<WorkFloorPreview workspace={ws.name}");
    expect(source).toContain("xl:grid-cols-3 2xl:grid-cols-4");
    expect(source).not.toContain("카드로 보기");
    expect(source).not.toContain("목록으로 보기");
  });

  it("목록의 수치가 자체적으로 의미를 드러낸다", () => {
    expect(source).toContain("완료한 작업 / 등록된 작업");
    expect(source).toContain("저장된 작업 이력");
    expect(source).toContain("작업 전에 확인할 도메인 규칙");
    expect(source).not.toContain("화면 안내");
  });
});
