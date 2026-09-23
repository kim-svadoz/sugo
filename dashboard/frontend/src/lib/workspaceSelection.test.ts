import { describe, expect, it } from "vitest";
import { workspaceCardShadow } from "./workspaceSelection.js";

describe("workspace selection chrome", () => {
  it("선택해도 도메인 고유 왼쪽 색을 보존하며 바깥 선택 링을 더한다", () => {
    const style = workspaceCardShadow("#fb923c", true);
    expect(style).toContain("inset 3px 0 0 #fb923c");
    expect(style).toContain("0 0 0 2px");
  });
});
