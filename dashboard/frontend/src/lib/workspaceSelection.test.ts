import { describe, expect, it } from "vitest";
import { WORKSPACE_CARD_FOCUS_CLASSES, WORKSPACE_COLORS, workspaceCardEmphasis } from "./workspaceSelection.js";

describe("workspace selection chrome", () => {
  it("인접 워크스페이스는 서로 다른 색상군을 쓰고 전역 인터랙션 cyan을 침범하지 않는다", () => {
    expect(WORKSPACE_COLORS.slice(0, 4)).toEqual(["#d979a1", "#c9a24f", "#9484d8", "#62ad91"]);
    expect(WORKSPACE_COLORS).not.toContain("#22d3ee");
    expect(WORKSPACE_COLORS).not.toContain("#fb7185");
    expect(WORKSPACE_COLORS).not.toContain("#f59e0b");
    expect(WORKSPACE_COLORS).not.toContain("#10b981");
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
