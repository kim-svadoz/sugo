import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const liveConsole = readFileSync(new URL("./LiveConsole.tsx", import.meta.url), "utf8");
const header = readFileSync(new URL("./Header.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("./Sidebar.tsx", import.meta.url), "utf8");
const home = readFileSync(new URL("../pages/Home.tsx", import.meta.url), "utf8");
const sessions = readFileSync(new URL("../pages/Sessions.tsx", import.meta.url), "utf8");
const workFloor = readFileSync(new URL("./WorkFloor.tsx", import.meta.url), "utf8");
const workBoard = readFileSync(new URL("./WorkBoard.tsx", import.meta.url), "utf8");
const domainStage = readFileSync(new URL("./DomainStage.tsx", import.meta.url), "utf8");

describe("Console 정보 구조", () => {
  it("최근 작업은 간결한 결과 요약만 보여주고 전체 기록은 Inspector Activity 탭에 둔다", () => {
    expect(liveConsole).not.toContain("최근 작업 요약");
    expect(liveConsole).not.toContain("title.title");
    expect(workFloor).toContain("title.title");
    expect(workFloor).toContain("projectName");
    expect(workFloor).not.toContain("이력 연결 안 됨");
    expect(liveConsole).toContain("작업이 완료되면 이곳에 결과를 3~4줄로 정리합니다");
    expect(liveConsole).not.toContain("다시 구현한 횟수");
    expect(liveConsole).not.toContain("작업 흐름");
    expect(liveConsole).not.toContain("전체 기록");
    expect(sessions).toContain('label: "Activity"');
  });

  it("작업 레인 아래에서 최근 요약과 Inspector를 독립 영역으로 나눈다", () => {
    expect(sessions).toContain('aria-label={`${selected.name} 작업 결과 요약`}');
    expect(sessions).toContain('aria-label={`${selected.name} Inspector`}');
    expect(workFloor).not.toContain("작업 결과 요약으로 연결");
  });

  it("작업장 머리의 중복 상태 문구 없이 파이프라인 단계만 보여준다", () => {
    expect(workFloor).toContain("진행 중인 파이프라인 없음");
    expect(workFloor).toContain("function PipelineStrip");
    expect(workFloor).toContain('className="w-full max-w-[860px] py-4"');
    expect(workFloor).not.toContain('className="mx-auto w-full max-w-[860px] py-4"');
    expect(workFloor).toContain("STATION_ICONS");
    expect(workFloor).not.toContain("작업 배정 대기");
    expect(workFloor).not.toContain("· 새 작업 대기");
    expect(workFloor).not.toContain("마지막 완료 ${relativeTime(lastAt, now)}");
    expect(workFloor).not.toContain("휴게 공간");
    expect(workFloor).not.toContain("째 쉬는 중");
  });

  it("완료·현재·예정 단계를 선과 아이콘 상태로 구분한다", () => {
    expect(workFloor).toContain("passed || active");
    expect(workFloor).toContain("border-cyan-300/60");
    expect(workFloor).toContain("border-emerald-400/35");
    expect(workFloor).toContain("border-slate-700/80");
    expect(workFloor).not.toContain("function WorksiteSign");
  });

  it("최근 작업 요약과 Inspector는 같은 상세 행의 높이를 함께 사용한다", () => {
    expect(sessions).toContain("grid min-h-[340px]");
    expect(sessions).toContain("2xl:min-h-[360px]");
    expect(sessions).toContain("min-h-0 flex-1 overflow-auto");
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
    expect(workBoard).toContain('useState<StationId>("spec")');
    expect(workBoard).toContain("grid-cols-8");
    expect(workBoard).toContain("xl:grid-cols-[minmax(0,6fr)_220px]");
    expect(workBoard).toContain("ck-work-route-dot");
    expect(workBoard).toContain('label: "오케스트레이터"');
    expect(workBoard).toContain('owner: "human", role: "사용자 입력"');
    expect(workBoard).toContain('owner: "human", role: "사용자 승인"');
    expect(workBoard).toContain('owner: "ai", role: "AI 실행"');
    expect(workBoard).toContain('owner: "ai", role: "AI 정리·출고"');
    expect(workBoard).toContain("사용자 정의");
    expect(workBoard).toContain("AI 실행");
    expect(workBoard).toContain("사용자 확인");
    expect(workBoard).toContain("AI 정리·출고");
    expect(workBoard).toContain("focused.owner === \"human\"");
    expect(workBoard).toContain("bg-[var(--color-surface)]");
    expect(workBoard).toContain('const HUMAN_ACCENT = "#fbbf24"');
    expect(workBoard).toContain('const AI_ACCENT = "#67e8f9"');
    expect(workBoard).not.toContain('color: "#2dd4bf"');
    expect(workBoard).not.toContain('color: "#34d399"');
    expect(workBoard).not.toContain('color: "#a78bfa"');
    expect(workBoard).toContain('aria-label="사람과 AI의 작업 구간"');
    expect(workBoard).toContain("WorkflowGroupRail");
    expect(workBoard).toContain("text-[12px] font-semibold");
    expect(workBoard).not.toContain("HandwrittenGroup");
    expect(workBoard).not.toContain('viewBox="0 0 100 12"');
    expect(workBoard).not.toContain("Nanum_Pen_Script");
    expect(workBoard).not.toContain("사람이 정함");
    expect(workBoard).not.toContain('aria-label="사용자와 AI의 작업 구간"');
    expect(workBoard).not.toContain("관련 화면 열기");
    expect(workBoard.match(/하네스 기준/g)?.length).toBe(1);
  });

  it("작업 레일은 현재 도메인·프로젝트·작업을 표시하고 활성 카드를 점보다 강하게 강조한다", () => {
    expect(workBoard).toContain("currentWork");
    expect(workBoard).toContain("projectName");
    expect(workBoard).toContain("currentWork.workspace");
    expect(workBoard).toContain("currentWork.title");
    expect(workBoard).not.toContain("각 작업대가 한 방향으로 결과를 넘깁니다.");
    expect(workBoard).toContain("ring-2 ring-amber-200/70");
    expect(workBoard).toContain("shadow-[0_0_0_1px_rgba(251,191,36,.28),0_0_28px_rgba(251,191,36,.22)]");
  });

  it("사용자 확인 단계의 원형 아이콘과 내 차례 배지 전체가 판단 영역으로 이동하는 버튼이다", () => {
    expect(domainStage).toContain("myTurn && onOpenAttention");
    expect(domainStage).toContain('aria-label="사용자 확인 영역 열기"');
    expect(domainStage).toContain('className="group flex min-w-0 flex-col items-center');
    expect(domainStage).toContain('group-hover:scale-105');
  });

  it("홈의 사용자 확인 진입점은 해당 도메인 현장을 정확히 선택해 연다", () => {
    expect(home).toContain("openAttentionWorkspace");
    expect(home).toContain("/sessions?workspace=");
    expect(home).toContain("onOpenAttention={openAttentionWorkspace}");
    expect(workBoard).toContain("onOpenAttention");
    expect(workBoard).toContain('station.id === "confirm" && waitingReviews > 0 && currentWork');
    expect(workBoard).toContain("확인하러 가기");
    expect(sessions).toContain("useSearchParams");
    expect(sessions).toContain('searchParams.get("workspace")');
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
