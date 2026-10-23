import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const liveConsole = readFileSync(new URL("./LiveConsole.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("./Header.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("./Sidebar.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../pages/Home.tsx", import.meta.url), "utf8");

describe("Console 정보 구조", () => {
  it("최근 작업은 간결한 결과 요약과 전체 기록만 보여준다", () => {
    expect(liveConsole).toContain("최근 작업 신호");
    expect(liveConsole).not.toContain("다시 구현한 횟수");
    expect(liveConsole).not.toContain("작업 흐름");
    expect(liveConsole).toContain("전체 기록");
  });

  it("버전은 헤더 액션에서 빼고 사이드바 하단의 보조 정보로 둔다", () => {
    expect(header).not.toContain("Console</span>");
    expect(sidebar).toContain("Sugo 대시보드");
    expect(sidebar).toContain("워크플로우 엔진");
    expect(sidebar).not.toContain("<span>Console {dashboardVersion}");
  });

  it("피드는 요일을 유지하고 오늘은 밝은 테두리로만 구분하며 국내외 필터를 제공한다", () => {
    expect(home).toContain("{day.weekday}");
    expect(home).not.toContain('day.isToday ? "오늘"');
    expect(home).toContain("border-cyan-200/80");
    expect(home).toContain('day.isToday ? "border-cyan-200/80 bg-transparent');
    expect(home).not.toContain("setRegion(value); setSelectedDay(undefined)");
    expect(home).toContain("setRegion(value); setPage(1)");
    expect(home).toContain("'전체'");
    expect(home).toContain("'국내'");
    expect(home).toContain("'국외'");
  });

  it("Engineering Feed는 군더더기 갱신 문구 없이 기술 블로그 모음임을 설명한다", () => {
    expect(home).toContain("Engineering Feed");
    expect(home).toContain("기술 블로그 모음");
    expect(home).not.toContain("매일 오전 8시 갱신");
    expect(home).not.toContain("collectedAt(feed.fetchedAt)");
    expect(home).not.toContain("relativeTime(item.publishedAt)");
  });
});
