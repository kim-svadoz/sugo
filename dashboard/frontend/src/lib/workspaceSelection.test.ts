import { describe, expect, it } from "vitest";
import { WORKSPACE_CARD_FOCUS_CLASSES, workspaceCardShadow } from "./workspaceSelection.js";

describe("workspace selection chrome", () => {
  it("선택해도 도메인 고유 왼쪽 색을 보존하되 잘리는 바깥 링은 만들지 않는다", () => {
    const style = workspaceCardShadow("#fb923c", true);
    expect(style).toContain("inset 3px 0 0 #fb923c");
    expect(style).not.toContain("0 0 0 2px");
    expect(style).not.toContain("rgba(34,211,238");
    expect(style).toContain("0 12px 28px");
  });

  it("브라우저 기본 포커스 외곽선 대신 내부 배경으로 키보드 포커스를 표시한다", () => {
    expect(WORKSPACE_CARD_FOCUS_CLASSES).toContain("focus-visible:outline-none");
    expect(WORKSPACE_CARD_FOCUS_CLASSES).toContain("focus-visible:bg-cyan");
    expect(WORKSPACE_CARD_FOCUS_CLASSES).not.toContain("ring-");
  });
});
