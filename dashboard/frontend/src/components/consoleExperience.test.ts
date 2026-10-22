import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const liveConsole = readFileSync(new URL("./LiveConsole.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("./Header.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("./Sidebar.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../pages/Home.tsx", import.meta.url), "utf8");

describe("Console 정보 구조", () => {
  it("라이브 원문 대신 최근 결과와 작업 흐름을 먼저 보여준다", () => {
    expect(liveConsole).toContain("최근 작업 신호");
    expect(liveConsole).toContain("다시 구현한 횟수");
    expect(liveConsole).toContain("전체 기록");
  });

  it("버전은 헤더 액션에서 빼고 사이드바 하단의 보조 정보로 둔다", () => {
    expect(header).not.toContain("Console</span>");
    expect(sidebar).toContain("Sugo 대시보드");
    expect(sidebar).toContain("워크플로우 엔진");
    expect(sidebar).not.toContain("<span>Console {dashboardVersion}");
  });

  it("피드는 오늘 표시와 국내외 필터를 제공한다", () => {
    expect(home).toContain("오늘");
    expect(home).toContain("'전체'");
    expect(home).toContain("'국내'");
    expect(home).toContain("'국외'");
  });

  it("Engineering Feed는 시각 메타데이터 대신 오전 8시 갱신 규칙을 안내한다", () => {
    expect(home).toContain("Engineering Feed");
    expect(home).toContain("매일 오전 8시 갱신");
    expect(home).not.toContain("collectedAt(feed.fetchedAt)");
    expect(home).not.toContain("relativeTime(item.publishedAt)");
  });
});
