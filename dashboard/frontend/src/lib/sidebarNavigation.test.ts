import { readFileSync } from "node:fs";
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
      { label: "업무", paths: ["/sessions", "/schedule", "/weekly"] },
      { label: "둘러보기", paths: ["/skills", "/playbook"] },
      { label: "환경", paths: ["/harness", "/settings"] },
    ]);
  });

  it("그룹 제목은 작은 보조문구가 아니라 독립된 시각 영역으로 표시한다", () => {
    const source = readFileSync(new URL("../components/Sidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("data-sidebar-group-heading");
    expect(source).toContain("text-xs");
  });

  it("사이드바 범위를 벗어난 숫자와 일반 키는 이동하지 않는다", () => {
    expect(sidebarShortcutPath("0")).toBeNull();
    expect(sidebarShortcutPath("8")).toBeNull();
    expect(sidebarShortcutPath("s")).toBeNull();
  });
});
