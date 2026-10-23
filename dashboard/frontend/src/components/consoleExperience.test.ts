import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const liveConsole = readFileSync(new URL("./LiveConsole.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("./Header.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("./Sidebar.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../pages/Home.tsx", import.meta.url), "utf8");
const sessions = readFileSync(new URL("../pages/Sessions.tsx", import.meta.url), "utf8");
const workFloor = readFileSync(new URL("./WorkFloor.tsx", import.meta.url), "utf8");
const workRoom = readFileSync(new URL("./workroom/WorkRoom.tsx", import.meta.url), "utf8");

describe("Console 정보 구조", () => {
  it("최근 작업은 간결한 결과 요약과 전체 기록만 보여준다", () => {
    expect(liveConsole).toContain("최근 작업 요약");
    expect(liveConsole).not.toContain("title.title");
    expect(liveConsole).toContain("작업이 완료되면 이곳에 결과를 3~4줄로 정리합니다");
    expect(liveConsole).not.toContain("다시 구현한 횟수");
    expect(liveConsole).not.toContain("작업 흐름");
    expect(liveConsole).toContain("전체 기록");
  });

  it("작업 레인과 최근 요약 사이에 읽을 수 있는 연결 브리지를 표시한다", () => {
    expect(sessions).toContain("완료 결과가 아래 요약으로 이어집니다");
    expect(sessions).toContain("ck-summary-bridge");
    expect(workFloor).not.toContain("작업 결과 요약으로 연결");
  });

  it("최근 작업 요약과 Inspector는 서로의 높이를 늘리지 않는다", () => {
    expect(sessions).toContain("items-start");
    expect(sessions).toContain("self-start");
  });

  it("작업실은 네 전문 에이전트와 사용자 확인·커밋 출고 흐름을 각각 표시한다", () => {
    expect(workRoom).not.toContain('label: "전문 인력 작업실"');
    for (const label of ["코드 작성", "테스트", "검토", "문서 작업", "사용자 확인", "커밋 출고"]) expect(workRoom).toContain(`label: "${label}"`);
    expect(workRoom).toContain('label: "START · SPEC 작성"');
    expect(workRoom).toContain("WorkflowPath");
    expect(workRoom).not.toContain("WorkflowBeam");
    expect(workRoom).not.toContain('label="배정"');
    expect(workRoom.indexOf('id: "confirm"')).toBeLessThan(workRoom.indexOf('id: "dock"'));
    expect(workRoom).toContain("하네스 공급선");
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
