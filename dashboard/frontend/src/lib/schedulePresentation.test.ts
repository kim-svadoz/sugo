import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countUpcomingScheduledSpecs, daySpecOverflowClass, defaultSchedulePanelMode, isManualSpec, scheduleCardStyle, schedulePresentationReady, visibleRegisteredSpecs } from "./schedulePresentation.js";

describe("schedule presentation", () => {
  it("워크스페이스 색상 순서가 오기 전에는 Schedule 카드를 노출하지 않는다", () => {
    expect(schedulePresentationReady([{}], null)).toBe(false);
    expect(schedulePresentationReady(null, [{}])).toBe(false);
    expect(schedulePresentationReady([{}], [])).toBe(true);
  });

  it("기한 미정이 비고 등록 카드가 있으면 등록완료를 최초 탭으로 고른다", () => {
    expect(defaultSchedulePanelMode(0, 5)).toBe("scheduled");
    expect(defaultSchedulePanelMode(1, 5)).toBe("backlog");
    expect(defaultSchedulePanelMode(0, 0)).toBe("backlog");
  });

  it("오늘 이후 마감일이 등록된 Spec만 제목 개수에 포함한다", () => {
    expect(countUpcomingScheduledSpecs([
      { due_date: "2026-09-29", status: "done" },
      { due_date: "2026-10-07", status: "done" },
      { due_date: "2026-10-16", status: "pending" },
      { due_date: null, status: "pending" },
      { due_date: "2026-10-23", status: "dropped" },
    ], "2026-10-07")).toBe(3);
  });

  it("등록완료 목록은 완료됐고 기한도 지난 Spec만 숨긴다", () => {
    const specs = [
      { due_date: "2026-10-06", status: "done" },
      { due_date: "2026-10-06", status: "blocked" },
      { due_date: "2026-10-07", status: "done" },
      { due_date: "2026-10-08", status: "done" },
      { due_date: null, status: "done" },
    ];
    expect(visibleRegisteredSpecs(specs, "2026-10-07")).toEqual(specs.slice(1, 4));
  });

  it("워크스페이스 색은 굵은 레일에 집중하고 카드 표면은 절제한다", () => {
    const style = scheduleCardStyle("#fb923c");
    expect(style.borderLeftColor).toBe("#fb923c");
    expect(style.borderLeftWidth).toBe(4);
    expect(style.background).toContain("#fb923c18");
    expect(style.background).toContain("rgba(11, 17, 29, 0.98)");
    expect(style.background).not.toContain("#fb923c2E");
    expect(style.boxShadow).toContain("#fb923c1F");
    expect(style).not.toHaveProperty("color");
  });

  it("Schedule 카드 본문은 제목 공간을 위해 워크스페이스명을 반복하지 않는다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).not.toContain('max-w-full truncate font-mono text-[9.5px] font-semibold text-slate-300');
    expect(source).not.toContain('mr-1 font-mono text-[9px] font-semibold text-slate-400');
    expect(source).toContain("{commitment.title}</button>");
    expect(source).not.toContain("{commitment.workspace_name}</span>");
  });

  it("Calendar 카드는 날짜 위치와 중복되는 기한 초과 배지를 표시하지 않는다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("기한 초과");
    expect(source).not.toContain("<AlertTriangle");
  });

  it("대시보드에서 먼저 만든 SPEC 초안을 구분한다", () => {
    expect(isManualSpec("spec-manual-a1b2c3d4")).toBe(true);
    expect(isManualSpec("spec-feature-checkout")).toBe(false);
  });

  it("날짜 칸은 실제 높이를 넘을 때 브라우저가 내부 스크롤한다", () => {
    expect(daySpecOverflowClass()).toBe("overflow-y-auto");
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain("min-h-[26px] shrink-0");
    expect(source).toContain("완료");
  });

  it("오늘 강조 테두리가 월간 그리드 가장자리에서 잘리지 않도록 안전 여백을 둔다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain("grid-rows-6 gap-1 overflow-auto p-px");
  });

  it("SPEC 상세에서 별도 일정 닫기 상태를 노출하지 않는다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain("파이프라인 완료");
    expect(source).not.toContain('aria-label="일정 상태"');
    expect(source).not.toContain("setCommitmentClosed");
    expect(source).not.toContain("Agenda에 다시 열기");
  });

  it("Agenda 카드에는 완료 버튼 대신 최신 작업의 배포 범위를 제공한다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("지금 지켜야 할 약속");
    expect(source).not.toContain("+ 새 약속");
    expect(source).not.toContain("작업 약속");
    expect(source).not.toContain("WORK QUEUE");
    expect(source).not.toContain("마감이 지난 일정부터, 아직 닫지 않은 일정을 우선순위대로 보여줍니다.");
    expect(source).not.toContain("Calendar에서 전체 이력 보기");
    expect(source).not.toContain("작업 목표 추가");
    expect(source).toContain("DeploymentReach");
    expect(source).toContain('["LOCAL", "DEV", "STG", "PRD"]');
    expect(source).not.toContain("completeFromQueue");
  });

  it("Agenda 카드는 파이프라인 상태 태그와 D-day만 간결하게 표시한다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain('commitment.pipeline_status === "done"');
    expect(source).toContain('commitment.pipeline_status === "running"');
    expect(source).toContain(">진행 중</span>");
    expect(source).toContain('<CalendarDays size={11} className="text-slate-500" />{commitment.due_date}');
    expect(source).toContain("border-l border-white/10 pl-2");
    expect(source).toContain(">D-Day</span>");
    expect(source).toContain("D+{Math.abs(remaining)}");
    expect(source).not.toContain('{action.label !== "일정 닫기"');
    expect(source).not.toContain('className="line-clamp-1">{action.detail}</span>');
  });

  it("Agenda 일정 구간 헤더는 카드보다 또렷한 시각적 위계를 유지한다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain('className="text-[14px] font-bold text-white">{group.label}</h3>');
    expect(source).toContain('className="text-[11.5px] text-[var(--color-text-dim)]">{group.description}</span>');
    expect(source).toContain('"h-2.5 w-2.5 rounded-full"');
  });

  it("Schedule 카드 클릭은 상세만 열고 Canvas는 명시적 버튼으로만 연다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    const openSpecBody = source.match(/function openSpec\(spec: ScheduledSpec\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(openSpecBody).toContain("setSelected(spec)");
    expect(openSpecBody).not.toContain("setCanvasOverlay");
    expect(source).toContain('onClick={() => setCanvasOverlay({ workspace: selected.workspace_name, nodeId: selected.focus_task_id ?? selected.id })}');
  });

  it("SPEC 카드가 있는 날짜도 셀의 빈 영역을 더블클릭하면 해당 날짜의 메모 추가를 연다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain('onDoubleClick={() => setMemoTarget({ initialDate: key })}');
    expect(source).toContain('onDoubleClick={(event) => event.stopPropagation()}');
    expect(source).toContain('"group relative flex select-none flex-col');
    expect(source).toContain("더블클릭해 메모");
    expect(source).not.toContain("> 메모 추가</button>");
  });

  it("Planning Inbox와 메모는 Calendar에서만 보인다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain('useState<"backlog" | "memo">("backlog")');
    expect(source).toContain('onClick={() => setPanelMode("memo")}');
    expect(source).toContain("sortedMemos.map");
    expect(source).toContain('panelMode === "memo"');
    expect(source).toContain("Planning Inbox");
    expect(source).toContain('scheduleView === "month" && (');
    expect(source).toContain("whitespace-nowrap");
    expect(source).not.toContain("scheduledMemos.map");
    expect(source).not.toContain("memoBacklog.map");
  });

  it("Calendar 명칭과 실제 feat/patch 이력을 노출한다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain("<CalendarDays size={14} /> Calendar");
    expect(source).toContain("개발 이력");
    expect(source).toContain('entry.version === 0 ? "feat" : `patch ${entry.version}`');
    expect(source).not.toContain("spec-writer와 실행 에이전트가 함께 봅니다");
    expect(source).not.toContain("이 SPEC에서 실행한 feat와 patch를 시간순으로 보여줍니다.");
  });

  it("개발 이력은 긴 제목만 남기고 중복 본문을 반복하지 않는다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain("{entry.title}</span>");
    expect(source).not.toContain("entry.summary && entry.summary !== entry.title");
  });

  it("준비된 SPEC에 중복 feat 명령 복사 버튼을 노출하지 않는다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain("feat 시작");
    expect(source).toContain("SPEC 재작성");
    expect(source).toContain('copyWorkflowCommand("feat", buildFeatCommand(selected))');
  });

  it("SPEC 상세는 실행 컨텍스트와 단일 명령 행동으로 위계를 정리한다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain("작업 컨텍스트");
    expect(source).toContain("완료 목표일");
    expect(source).toContain("저장소");
    expect(source).toContain('aria-haspopup="listbox"');
    expect(source).toContain('aria-label="저장소 선택"');
    expect(source).toContain("작업 브랜치");
    expect(source).toContain("작업 준비");
    expect(source).toContain("실행 에이전트");
    expect(source).toContain("명령 복사");
    expect(source).toContain("프로젝트 도구");
    expect(source).not.toContain("대상 프로젝트 · 선택하면 바로 저장됩니다");
    expect(source).not.toContain("없으면 현재 브랜치에서 시작합니다.");
    expect(source).not.toContain("마감 기준과 구현이 실행될 저장소를 확인합니다.");
    expect(source).not.toContain("SPEC → feat");
    expect(source).not.toContain("grid grid-cols-2 gap-2 pt-2");
  });

  it("완료 SPEC에는 후속 patch 행동과 읽기 쉬운 프로젝트 도구를 제공한다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    const canvasPanel = readFileSync(new URL("../components/SubtaskPanel.tsx", import.meta.url), "utf8");
    const tools = readFileSync(new URL("./workspaceTools.ts", import.meta.url), "utf8");
    expect(source).toContain("후속 개발");
    expect(source).toContain("새 Patch 시작");
    expect(source).toContain("작업 기록 이어붙이기");
    expect(source).toContain("group/attach-help");
    expect(source).toContain("group-hover/attach-help:opacity-100");
    expect(source).toContain("group-focus-within/attach-help:opacity-100");
    expect(source).not.toContain('className="basis-full text-[10px]');
    expect(source).toContain("w-[156px]");
    expect(source).toContain("w-[174px]");
    expect(canvasPanel).not.toContain("작업 기록 이어붙이기");
    expect(source).toContain("작업 컨텍스트");
    expect(source).toContain("작업 준비");
    expect(source).toContain("프로젝트 도구");
    expect(source).toContain("WORKSPACE_RULES_TOOL.label");
    expect(source).toContain("AI_WORK_STATUS_TOOL.label");
    expect(tools).toContain('label: "도메인 규칙 관리"');
    expect(tools).toContain('label: "AI 작업 현황"');
  });

  it("작은 화면의 일정 점은 최신 FEAT/PATCH와 작업 요약을 미리 보여준다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain("latestDevelopmentPreview(spec)");
    expect(source).toContain("preview.label");
    expect(source).toContain("preview.title");
    expect(source).toContain("line-clamp-1");
    expect(source).not.toContain("preview.summary");
  });

  it("Workspaces와 Schedule은 같은 도구 명칭과 설명 정본을 사용한다", () => {
    const workspaces = readFileSync(new URL("../pages/Sessions.tsx", import.meta.url), "utf8");
    const schedule = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    const checkpoint = readFileSync(new URL("../components/CheckpointPanel.tsx", import.meta.url), "utf8");
    for (const source of [workspaces, schedule]) {
      expect(source).toContain("WORKSPACE_RULES_TOOL.label");
      expect(source).toContain("AI_WORK_STATUS_TOOL.label");
    }
    expect(workspaces).toContain("flex flex-nowrap items-center gap-2");
    expect(workspaces).not.toContain("md:col-span-2 xl:col-span-2");
    expect(checkpoint).toContain("WORKSPACE_RULES_TOOL.label");
  });

  it("Workspaces 확인 필요 브리프는 Schedule의 해당 SPEC 상세를 연다", () => {
    const workspaces = readFileSync(new URL("../pages/Sessions.tsx", import.meta.url), "utf8");
    const schedule = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(workspaces).toContain("/schedule?reviewWorkspace=");
    expect(workspaces).toContain("확인할 작업 열기 →");
    expect(workspaces).not.toContain("검토할 도메인 열기 →");
    expect(schedule).toContain('searchParams.get("reviewWorkspace")');
    expect(schedule).toContain("openSpec(reviewTarget)");
  });

  it("Canvas는 AI 작업 현황을 주 제목으로, Agent Canvas를 보조 명칭으로 쓴다", () => {
    const overlay = readFileSync(new URL("../components/AgentCanvasOverlay.tsx", import.meta.url), "utf8");
    const page = readFileSync(new URL("../pages/RoadmapPage.tsx", import.meta.url), "utf8");
    expect(overlay).toContain("AI_WORK_STATUS_TOOL.label");
    expect(overlay).toContain("Agent Canvas · Spec");
    expect(page).toContain("AI_WORK_STATUS_TOOL.label");
  });

  it("기획 참고자료는 이미지와 링크를 함께 다루고 빈 읽기 전용 영역은 숨긴다", () => {
    const source = readFileSync(new URL("../components/SpecAttachments.tsx", import.meta.url), "utf8");
    expect(source).toContain("기획 참고자료");
    expect(source).toContain("기획 문서 링크");
    expect(source).toContain("listSpecReferences");
    expect(source).toContain("locked && items.length === 0 && links.length === 0");
    expect(source).not.toContain(">기획 화면</span>");
  });

  it("카드 상태와 본문 길이가 달라도 같은 높이를 유지한다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain("h-[76px] flex-col items-start");
    expect(source).toContain("h-[92px] items-center");
  });

  it("정보가 많은 SPEC 상세는 확장 모달을 사용한다", () => {
    const schedule = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    const modal = readFileSync(new URL("../components/Modal.tsx", import.meta.url), "utf8");
    expect(schedule).toContain('size="xwide"');
    expect(modal).toContain('max-h-[92vh] max-w-[1320px]');
    expect(modal).toContain('max-h-[calc(92vh-60px)] px-9 py-7');
  });

  it("메모 카드는 어두운 캔버스에서도 읽히는 불투명도와 명도 대비를 쓴다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain("border-slate-400/45 bg-slate-400/[0.14]");
    expect(source).toContain("text-slate-100");
    expect(source).not.toContain("border-slate-500/30 bg-slate-500/[0.08]");
    expect(source).not.toContain("border-slate-500/30 bg-slate-500/[0.09]");
  });

  it("모든 SPEC 상세에는 복구 가능한 삭제·종료 UI가 있다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).not.toContain('selected.id.startsWith("spec-manual-")');
    expect(source).toContain("이 작업을 삭제할까요?");
    expect(source).toContain("개발 이력과 파일은 지우지 않으며 보관함에서 확인하고 복구할 수 있습니다.");
    expect(source).toContain("작업 종료");
    expect(source).toContain("<SpecArchiveModal");
    expect(source).toContain('className="fixed inset-0 z-[80] flex items-center justify-center');
    expect(source).toContain('role="dialog" aria-modal="true"');
    expect(source).toContain('window.addEventListener("keydown", cancelArchive, true)');
    expect(source).toContain('|| !!archiveConfirm}');
  });

  it("Agenda는 지난 미종료 SPEC과 7일 이후 등록 수를 함께 보여준다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain('state: "active" as const');
    expect(source).toContain("agenda.map((group)");
    expect(source).not.toContain("commitmentPulse");
  });
});
