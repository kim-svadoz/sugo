import { describe, expect, it } from "vitest";
import { shouldApplyHoverFocus } from "./interaction.js";

describe("canvas selection interaction", () => {
  it("Inspector가 열린 동안 hover focus를 중지해 선택 직후 깜빡임을 만들지 않는다", () => {
    expect(shouldApplyHoverFocus("spec-1", "spec-1")).toBe(false);
    expect(shouldApplyHoverFocus("run-1", "spec-1")).toBe(false);
  });

  it("선택이 없어도 hover 때문에 다른 카드가 꺼지지 않는다", () => {
    expect(shouldApplyHoverFocus("spec-1", null)).toBe(false);
    expect(shouldApplyHoverFocus(null, null)).toBe(false);
  });
});
