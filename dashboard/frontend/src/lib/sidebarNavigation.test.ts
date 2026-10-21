import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SIDEBAR_GROUPS, sidebarShortcutPath } from "./sidebarNavigation.js";

describe("sidebar keyboard navigation", () => {
  it("숫자 1부터 8까지 사이드바 순서대로 이동한다", () => {
    expect(["1", "2", "3", "4", "5", "6", "7", "8"].map(sidebarShortcutPath)).toEqual([
      "/sessions",
      "/schedule",
      "/weekly",
      "/skills",
      "/playbook",
      "/harness",
      "/settings",
      "/preferences",
    ]);
  });

  it("업무·가이드·설정 목적에 따라 내비게이션을 세 그룹으로 나눈다", () => {
    expect(SIDEBAR_GROUPS.map(({ label, items }) => ({ label, paths: items.map((item) => item.to) }))).toEqual([
      { label: "Work", paths: ["/sessions", "/schedule", "/weekly"] },
      { label: "Guides", paths: ["/skills", "/playbook"] },
      { label: "Settings", paths: ["/harness", "/settings", "/preferences"] },
    ]);
  });

  it("그룹 제목은 번호 없이 라벨과 구분선으로 영역을 분명하게 나눈다", () => {
    const source = readFileSync(new URL("../components/Sidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("data-sidebar-group-heading");
    expect(source).not.toContain("groupIndex + 1");
    expect(source).toContain("data-sidebar-group-line");
    expect(source).toContain("tracking-[0.14em]");
  });

  it("사이드바에 제품명과 역할을 설명하는 브랜드 블록을 표시한다", () => {
    const source = readFileSync(new URL("../components/Sidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain('aria-label="SUGO 홈"');
    expect(source).toContain("SUGO");
    expect(source).not.toContain('>Console<');
    expect(source).toContain("AI 개발 워크플로우");
    expect(source).toContain('text-[12px]');
    expect(source).toContain('to="/home"');
    expect(source).not.toContain("Control Plane");
    expect(source).not.toContain("작업 허브");
    expect(source).not.toContain("수동 새로고침");
    expect(source).not.toContain("로그아웃");
  });

  it("Home에서는 날짜·날씨를, 다른 화면에서는 제품 메시지를 표시한다", () => {
    const source = readFileSync(new URL("../components/Header.tsx", import.meta.url), "utf8");
    expect(source).toContain("useLocation");
    expect(source).toContain("useLocalWeather");
    expect(source).toContain("Schedule은 D-2부터 미종료 SPEC");
    expect(source).toContain("Harness에서 기술과 버전을 선택하면");
    expect(source).toContain("{time}");
    expect(source).not.toContain("Console running");
    expect(source).not.toContain("window.location.host");
    expect(source).toContain("프로필 메뉴");
    expect(source).toContain("시스템 설정");
  });

  it("사이드바 범위를 벗어난 숫자와 일반 키는 이동하지 않는다", () => {
    expect(sidebarShortcutPath("0")).toBeNull();
    expect(sidebarShortcutPath("9")).toBeNull();
    expect(sidebarShortcutPath("s")).toBeNull();
  });
});
