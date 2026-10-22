import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./Home.tsx", import.meta.url), "utf8");

describe("Home 학습 리뷰 노트", () => {
  it("근거 보기는 Schedule로 이동하지 않고 홈 안에서 학습 리뷰 노트를 연다", () => {
    expect(source).toContain("학습 리뷰 노트");
    expect(source).toContain("setReviewNoteOpen(true)");
    expect(source).not.toContain("onClick={() => openWork(point.workspace, point.id)}");
  });
});
