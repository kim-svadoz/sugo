import { describe, expect, it } from "vitest";
import { WORKSPACE_CARD_FOCUS_CLASSES, WORKSPACE_COLORS, workspaceCardEmphasis, workspaceCardShadow } from "./workspaceSelection.js";

describe("workspace selection chrome", () => {
  it("인접 워크스페이스는 서로 다른 색상군을 쓰고 전역 인터랙션 cyan을 침범하지 않는다", () => {
    expect(WORKSPACE_COLORS.slice(0, 4)).toEqual(["#fb7185", "#fbbf24", "#a78bfa", "#34d399"]);
    expect(WORKSPACE_COLORS).not.toContain("#22d3ee");
  });

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

  it("선택 카드와 나머지 카드 사이에 외곽선 없는 명도 대비를 만든다", () => {
    expect(workspaceCardEmphasis(true, true)).toContain("bg-cyan-400/[0.075]");
    expect(workspaceCardEmphasis(false, true)).toContain("opacity-[0.82]");
    expect(workspaceCardEmphasis(false, true)).toContain("saturate-[0.85]");
    expect(workspaceCardEmphasis(false, false)).toContain("opacity-100");
  });
});
