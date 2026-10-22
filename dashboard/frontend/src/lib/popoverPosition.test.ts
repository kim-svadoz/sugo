import { describe, expect, it } from "vitest";
import { placePopover } from "./popoverPosition.js";

describe("팝오버 위치", () => {
  it("트리거 아래 공간이 부족하면 달력을 위로 열고 화면 안에 고정한다", () => {
    expect(placePopover(
      { top: 820, bottom: 860, left: 390, width: 180 },
      { width: 288, height: 320 },
      { width: 900, height: 900 },
    )).toEqual({ top: 496, left: 390, placement: "top" });
  });

  it("좌우 끝에서도 여백을 남긴다", () => {
    expect(placePopover(
      { top: 50, bottom: 90, left: 780, width: 110 },
      { width: 288, height: 320 },
      { width: 900, height: 900 },
    )).toEqual({ top: 94, left: 600, placement: "bottom" });
  });
});
