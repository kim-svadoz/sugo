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
});
