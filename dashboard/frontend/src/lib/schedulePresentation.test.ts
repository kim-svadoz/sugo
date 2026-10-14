import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countUpcomingScheduledSpecs, daySpecOverflowClass, isManualSpec, scheduleCardStyle, schedulePresentationReady, visibleRegisteredSpecs } from "./schedulePresentation.js";

describe("schedule presentation", () => {
  it("워크스페이스 색상 순서가 오기 전에는 Schedule 카드를 노출하지 않는다", () => {
    expect(schedulePresentationReady([{}], null)).toBe(false);
    expect(schedulePresentationReady(null, [{}])).toBe(false);
    expect(schedulePresentationReady([{}], [])).toBe(true);
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

  it("워크스페이스 색은 굵은 레일과 충분한 대비의 그라데이션 표면으로 구분한다", () => {
    const style = scheduleCardStyle("#fb923c");
    expect(style.borderLeftColor).toBe("#fb923c");
    expect(style.borderLeftWidth).toBe(4);
    expect(style.background).toContain("#fb923c2E");
    expect(style.boxShadow).toContain("#fb923c33");
    expect(style).not.toHaveProperty("color");
  });

  it("기한 초과는 외곽선 대신 명시적인 경고 배지로 표시한다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain("기한 초과");
    expect(source).not.toContain('overdue && "ring-1 ring-rose-400"');
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

  it("RUN이 시작된 모든 SPEC 카드에 진행중 단계를 표시한다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain("const guidance = scheduleAttention(spec)");
    expect(source).toContain('<SpecStageBadge spec={s} compact />');
  });

  it("Schedule 카드 클릭은 상세만 열고 Canvas는 명시적 버튼으로만 연다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    const openSpecBody = source.match(/function openSpec\(spec: ScheduledSpec\) \{([\s\S]*?)\n  \}/)?.[1] ?? "";
    expect(openSpecBody).toContain("setSelected(spec)");
    expect(openSpecBody).not.toContain("setCanvasOverlay");
    expect(source).toContain('onClick={() => setCanvasOverlay({ workspace: selected.workspace_name, nodeId: selected.focus_task_id ?? selected.id })}');
  });

  it("비어 있는 날짜 칸 더블클릭은 해당 날짜가 지정된 메모 추가를 연다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain('onDoubleClick={() => dayChips.length === 0 && dayMemos.length === 0 && setMemoTarget({ initialDate: key })}');
  });

  it("메모는 SPEC 등록완료와 분리된 전용 탭에만 표시한다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain('useState<"backlog" | "scheduled" | "memo">');
    expect(source).toContain('onClick={() => setPanelMode("memo")}');
    expect(source).toContain("sortedMemos.map");
    expect(source).toContain('panelMode === "memo"');
    expect(source).toContain("whitespace-nowrap");
    expect(source).not.toContain("기한 미정 · {backlog.length}");
    expect(source).not.toContain("등록완료 · {scheduledSorted.length}");
    expect(source).not.toContain("scheduledMemos.map");
    expect(source).not.toContain("memoBacklog.map");
  });

  it("메모 카드는 어두운 캔버스에서도 읽히는 불투명도와 명도 대비를 쓴다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain("border-slate-400/45 bg-slate-400/[0.14]");
    expect(source).toContain("text-slate-100");
    expect(source).not.toContain("border-slate-500/30 bg-slate-500/[0.08]");
    expect(source).not.toContain("border-slate-500/30 bg-slate-500/[0.09]");
  });

  it("대시보드 수동 SPEC 상세에는 파일 보존을 알리는 2단계 삭제 UI가 있다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain('selected.id.startsWith("spec-manual-")');
    expect(source).toContain("이 SPEC을 삭제할까요?");
    expect(source).toContain("로컬에 작성된 Markdown 파일은 삭제하지 않습니다.");
    expect(source).toContain("SPEC과 계보 삭제");
  });
});
