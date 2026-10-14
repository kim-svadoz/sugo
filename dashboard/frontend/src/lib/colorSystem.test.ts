import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AGENT_COLOR_HEX, AGENT_TONES } from "./colorSystem.js";
import { WORKSPACE_COLORS } from "./workspaceSelection.js";

const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");

describe("semantic color system", () => {
  it("기반·상호작용·상태·식별 색상을 서로 다른 토큰 계층으로 제공한다", () => {
    expect(css).toContain("--color-action-primary:");
    expect(css).toContain("--color-status-success:");
    expect(css).toContain("--color-status-warning:");
    expect(css).toContain("--color-status-danger:");
    expect(css).toContain("--color-identity-code:");
    expect(css).toContain("--color-deployment:");
  });

  it("워크스페이스 식별색은 전역 상호작용색과 상태색을 그대로 재사용하지 않는다", () => {
    const reserved = ["#00b4d8", "#10b981", "#f59e0b", "#fb7185"];
    expect(WORKSPACE_COLORS.some((color) => reserved.includes(color))).toBe(false);
  });

  it("에이전트 색상 값과 표현 클래스를 단일 정본으로 제공한다", () => {
    expect(AGENT_COLOR_HEX.MAIN).toBe("#00b4d8");
    expect(AGENT_TONES.review.icon).toContain("identity-review");
    expect(AGENT_TONES.test.icon).toContain("identity-test");
  });

  it("Harness 버전 선택은 경고색이 아니라 전역 상호작용색을 사용한다", () => {
    const source = readFileSync(new URL("../pages/Harness.tsx", import.meta.url), "utf8");
    expect(source).toContain("color-action-primary");
    expect(source).not.toContain("border-amber-400/50 bg-amber-400/10 text-amber-200");
  });
});
