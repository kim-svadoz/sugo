import { describe, expect, it } from "vitest";
import { SIDEBAR_GROUPS, sidebarShortcutPath } from "./sidebarNavigation.js";

describe("sidebar keyboard navigation", () => {
  it("숫자 1부터 7까지 사이드바 순서대로 이동한다", () => {
    expect(["1", "2", "3", "4", "5", "6", "7"].map(sidebarShortcutPath)).toEqual([
      "/sessions",
      "/schedule",
      "/weekly",
      "/skills",
      "/playbook",
      "/harness",
      "/settings",
    ]);
  });

  it("업무·탐색·제어 목적에 따라 내비게이션을 세 그룹으로 나눈다", () => {
    expect(SIDEBAR_GROUPS.map(({ label, items }) => ({ label, paths: items.map((item) => item.to) }))).toEqual([
      { label: "WORK", paths: ["/sessions", "/schedule", "/weekly"] },
      { label: "EXPLORE", paths: ["/skills", "/playbook"] },
      { label: "CONTROL", paths: ["/harness", "/settings"] },
    ]);
  });

  it("사이드바 범위를 벗어난 숫자와 일반 키는 이동하지 않는다", () => {
    expect(sidebarShortcutPath("0")).toBeNull();
    expect(sidebarShortcutPath("8")).toBeNull();
    expect(sidebarShortcutPath("s")).toBeNull();
  });
});
