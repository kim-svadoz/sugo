import { describe, expect, it } from "vitest";
import { measuredLeafHeight } from "./layoutSizing.js";

describe("canvas leaf sizing", () => {
  it("TASK의 실제 카드 높이를 절반으로 축소 계산하지 않는다", () => {
    expect(measuredLeafHeight("task")).toBe(158);
  });
});
