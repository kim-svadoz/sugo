import { describe, expect, it } from "vitest";
import { sidebarShortcutPath } from "./sidebarNavigation.js";

describe("sidebar keyboard navigation", () => {
  it("숫자 1부터 6까지 사이드바 순서대로 이동한다", () => {
    expect(["1", "2", "3", "4", "5", "6"].map(sidebarShortcutPath)).toEqual([
      "/sessions",
      "/schedule",
      "/skills",
      "/harness",
      "/playbook",
      "/settings",
    ]);
  });

  it("사이드바 범위를 벗어난 숫자와 일반 키는 이동하지 않는다", () => {
    expect(sidebarShortcutPath("0")).toBeNull();
    expect(sidebarShortcutPath("7")).toBeNull();
    expect(sidebarShortcutPath("s")).toBeNull();
  });
});
