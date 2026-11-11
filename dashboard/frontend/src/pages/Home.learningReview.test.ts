import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Home.tsx", import.meta.url), "utf8");

describe("Home 학습 리뷰 노트", () => {
  it("근거 보기는 Schedule로 이동하지 않고 홈 안에서 학습 리뷰 노트를 연다", () => {
    expect(source).toContain("학습 리뷰 노트");
    expect(source).toContain("setSelectedNote(note)");
    expect(source).not.toContain("onClick={() => openWork(point.workspace, point.id)}");
  });

  it("리뷰 노트는 어제의 작업 영역 안에서 같은 작업의 학습 리뷰로 연결한다", () => {
    expect(source).toContain("마지막 결과 학습 리뷰");
    expect(source).toContain("latestHistory");
    expect(source).toContain("histories.slice(0, 4)");
  });

  it("최근 작업마다 각자의 학습 리뷰 진입점을 표시한다", () => {
    expect(source).not.toContain("point?.specId === spec.id");
    expect(source).toContain("notes.get(spec.id)");
  });

  it("리뷰에 원본 명령과 경로를 펼치지 않고 판단·학습·다음 확인만 보여준다", () => {
    expect(source).toContain("판단과 대안");
    expect(source).toContain("남긴 학습");
    expect(source).toContain("다음 확인");
    expect(source).not.toContain("근거 기록 ·");
    expect(source).not.toContain("{test.command");
  });

  it("확인 필요 건수는 상단 작업 장면의 독립 KPI가 아니라 오늘의 리뷰 제목에 붙인다", () => {
    expect(source).not.toContain('<span className="text-[9px] text-violet-200/70">확인 필요</span>');
    expect(source).toContain('오늘의 리뷰</h2>{brief.decisions.length > 0 &&');
    expect(source).toContain('건 확인 필요');
  });

  it("상단의 큰 이동 버튼을 제거하고 실제 판단 작업 문맥을 작업 레일에 전달한다", () => {
    expect(source).not.toContain("판단할 작업 열기");
    expect(source).not.toContain("작업 흐름 보기");
    expect(source).toContain("currentWork={brief.decisions[0]}");
  });
});
