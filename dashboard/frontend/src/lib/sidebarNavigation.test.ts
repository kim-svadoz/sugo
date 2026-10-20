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

  it("그룹 제목은 번호 없이 라벨과 구분선으로 영역을 분명하게 나눈다", () => {
    const source = readFileSync(new URL("../components/Sidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain("data-sidebar-group-heading");
    expect(source).not.toContain("groupIndex + 1");
    expect(source).toContain("data-sidebar-group-line");
    expect(source).toContain("tracking-[0.2em]");
  });

  it("사이드바에 제품명과 역할을 설명하는 브랜드 블록을 표시한다", () => {
    const source = readFileSync(new URL("../components/Sidebar.tsx", import.meta.url), "utf8");
    expect(source).toContain('aria-label="SUGO 홈"');
    expect(source).toContain("SUGO");
    expect(source).toContain("Console");
    expect(source).toContain("AI 개발 워크플로우");
    expect(source).toContain("Workflow");
    expect(source).not.toContain("Control Plane");
    expect(source).not.toContain("작업 허브");
  });

  it("전역 헤더는 추상 슬로건 대신 Console 실행 상태와 주소를 표시한다", () => {
    const source = readFileSync(new URL("../components/Header.tsx", import.meta.url), "utf8");
    expect(source).toContain("Console running");
    expect(source).toContain("window.location.host");
    expect(source).not.toContain("AI development lifecycle");
    expect(source).not.toContain("Evidence-driven engineering");
    expect(source).not.toContain("반복 가능한 제품 흐름");
    expect(source).not.toContain("useLocation");
    expect(source).not.toContain("headerTitleForPath");
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
