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

  it("작업 흐름·지식·시스템 목적에 따라 내비게이션을 세 그룹으로 나눈다", () => {
    expect(SIDEBAR_GROUPS.map(({ label, items }) => ({ label, paths: items.map((item) => item.to) }))).toEqual([
      { label: "Workflow", paths: ["/sessions", "/schedule", "/weekly"] },
      { label: "Knowledge", paths: ["/skills", "/playbook"] },
      { label: "System", paths: ["/harness", "/settings"] },
    ]);
  });

  it("그룹 제목은 번호나 카드 없이 조용한 섹션 라벨로 표시한다", () => {
    const source = readFileSync(new URL("../components/Sidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("data-sidebar-group-heading");
    expect(source).not.toContain("groupIndex + 1");
    expect(source).not.toContain("bg-white/[0.028]");
  });

  it("사이드바 한 곳에 테두리 없는 SUGO Console 워드마크를 표시한다", () => {
    const source = readFileSync(new URL("../components/Sidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain('aria-label="SUGO 홈"');
    expect(source).toContain("SUGO");
    expect(source).toContain("Console");
    expect(source).not.toContain("shadow-[0_8px_24px");
    expect(source).not.toContain("Control Plane");
    expect(source).not.toContain("작업 허브");
    expect(source).toContain("leading-5");
    expect(source).not.toContain("truncate text-[12px] font-medium leading-none");
  });

  it("전역 헤더는 마케팅 문구 대신 현재 화면 이름을 표시한다", () => {
    const source = readFileSync(new URL("../components/Header.tsx", import.meta.url), "utf8");
    expect(source).toContain("useLocation");
    expect(source).toContain("headerTitleForPath");
    expect(source).not.toContain("AI Engineering Control Plane");
    expect(source).not.toContain("From specification to verified delivery.");
    expect(source).not.toContain("차곡차곡");
    expect(source).not.toContain("가져왔다냥");
  });

  it("사이드바 범위를 벗어난 숫자와 일반 키는 이동하지 않는다", () => {
    expect(sidebarShortcutPath("0")).toBeNull();
    expect(sidebarShortcutPath("8")).toBeNull();
    expect(sidebarShortcutPath("s")).toBeNull();
  });
});
