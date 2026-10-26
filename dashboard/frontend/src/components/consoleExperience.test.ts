import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const liveConsole = readFileSync(new URL("./LiveConsole.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("./Header.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("./Sidebar.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../pages/Home.tsx", import.meta.url), "utf8");
const sessions = readFileSync(new URL("../pages/Sessions.tsx", import.meta.url), "utf8");
const workFloor = readFileSync(new URL("./WorkFloor.tsx", import.meta.url), "utf8");
const workBoard = readFileSync(new URL("./WorkBoard.tsx", import.meta.url), "utf8");

describe("Console 정보 구조", () => {
  it("최근 작업은 간결한 결과 요약만 보여주고 전체 기록은 Inspector Activity 탭에 둔다", () => {
    expect(liveConsole).toContain("최근 작업 요약");
    expect(liveConsole).not.toContain("title.title");
    expect(liveConsole).toContain("작업이 완료되면 이곳에 결과를 3~4줄로 정리합니다");
    expect(liveConsole).not.toContain("다시 구현한 횟수");
    expect(liveConsole).not.toContain("작업 흐름");
    expect(liveConsole).not.toContain("전체 기록");
    expect(sessions).toContain('label: "Activity"');
  });

  it("작업 레인과 최근 요약 사이에 읽을 수 있는 연결 브리지를 표시한다", () => {
    expect(sessions).toContain("선택한 작업의 완료 기록");
    expect(sessions).toContain("ck-summary-bridge");
    expect(workFloor).not.toContain("작업 결과 요약으로 연결");
  });

  it("쉬는 공간을 파이프라인 단계처럼 붙이지 않고 시작점에서 다음 작업 배정을 기다린다", () => {
    expect(workFloor).toContain("작업 배정 대기");
    expect(workFloor).toContain("진행 중인 파이프라인 없음");
    expect(workFloor).toContain("· 새 작업 대기");
    expect(workFloor).toContain("마지막 완료 ${relativeTime(lastAt, now)}");
    expect(workFloor).not.toContain("휴게 공간");
    expect(workFloor).not.toContain("째 쉬는 중");
  });

  it("작업장 간판의 상태등으로 대기·진행·확인·중단·완료를 구분한다", () => {
    expect(workFloor).toContain("function WorksiteSign");
    expect(workFloor).toContain("도메인 작업장 상태:");
    for (const signal of ["idle", "working", "waiting", "paused", "complete"]) expect(workFloor).toContain(`${signal}: {`);
    expect(workFloor).toContain('signal="idle" label="새 작업 대기"');
    expect(workFloor).toContain("signal={signalOf(lane)}");
    expect(workFloor).toContain('role="tooltip"');
    expect(workFloor).toContain("group-hover/worksite-sign:opacity-100");
    expect(workFloor).toContain("group-focus-within/worksite-sign:opacity-100");
  });

  it("최근 작업 요약과 Inspector는 서로의 높이를 늘리지 않는다", () => {
    expect(sessions).toContain("items-start");
    expect(sessions).toContain("self-start");
  });

  it("작업실은 네 전문 에이전트와 사용자 확인·커밋 출고 흐름을 각각 표시한다", () => {
    expect(home).toContain("<WorkBoard");
    expect(home).not.toContain("<WorkRoom");
    expect(workBoard).not.toContain("Canvas");
    for (const label of ["코드 작성", "테스트", "검토", "문서 작업", "사용자 확인", "커밋 출고"]) expect(workBoard).toContain(`label: "${label}"`);
    // 실제 파이프라인 순서: 검토 → 사용자 확인 → 문서 작업.
    expect(workBoard.indexOf('label: "검토"')).toBeLessThan(workBoard.indexOf('label: "사용자 확인"'));
    expect(workBoard.indexOf('label: "사용자 확인"')).toBeLessThan(workBoard.indexOf('label: "문서 작업"'));
    expect(workBoard).toContain('label: "SPEC 작성"');
    expect(workBoard).toContain("grid-cols-8");
    expect(workBoard).toContain("xl:grid-cols-[minmax(0,6fr)_220px]");
    expect(workBoard).toContain("ck-work-route-dot");
    expect(workBoard).toContain('label: "오케스트레이터"');
    expect(workBoard).not.toContain("관련 화면 열기");
    expect(workBoard.match(/하네스 기준/g)?.length).toBe(1);
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
