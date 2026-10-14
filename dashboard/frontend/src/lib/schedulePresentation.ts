type ScheduleStatusItem = { due_date: string | null; status: string };

/** 카드 색은 워크스페이스 목록 순서가 정본이다. 두 응답 중 하나라도 아직 없으면 임시 색으로
 * 카드를 그리지 않고, 둘 다 준비된 뒤 한 번만 올바른 색으로 표시한다. */
export function schedulePresentationReady(
  specs: readonly unknown[] | null,
  workspaces: readonly unknown[] | null,
): boolean {
  return specs !== null && workspaces !== null;
}

export type SchedulePanelMode = "backlog" | "scheduled" | "memo";

/** 최초 랜딩에서 비어 있는 탭보다 실제 SPEC 카드가 있는 탭을 먼저 보여준다. */
export function defaultSchedulePanelMode(backlogCount: number, scheduledCount: number): SchedulePanelMode {
  return backlogCount === 0 && scheduledCount > 0 ? "scheduled" : "backlog";
}

/** Schedule 제목은 오늘부터 앞으로 날짜가 잡힌 SPEC 수를 보여준다. 상태와 기한 미정은 섞지 않는다. */
export function countUpcomingScheduledSpecs(specs: ScheduleStatusItem[], todayKey: string): number {
  return specs.filter((spec) => spec.due_date !== null && spec.due_date >= todayKey).length;
}

export function visibleRegisteredSpecs<T extends ScheduleStatusItem>(specs: T[], todayKey: string): T[] {
  return specs.filter((spec) => spec.due_date !== null && !(spec.status === "done" && spec.due_date < todayKey));
}

/** 워크스페이스 색은 소속을 찾는 4px 레일에 집중한다. 넓은 본문 표면은 중립색을 유지해
 * 제목과 상태 배지가 색 면적에 묻히지 않게 한다. */
export function scheduleCardStyle(color: string) {
  return {
    borderColor: `${color}52`,
    borderLeftColor: color,
    borderLeftWidth: 4,
    background: `linear-gradient(105deg, ${color}18 0%, rgba(11, 17, 29, 0.96) 42%, rgba(11, 17, 29, 0.98) 100%)`,
    boxShadow: `inset 0 0 0 1px ${color}1F`,
  };
}

/** Schedule에서 Run/Task 없이 먼저 만든 최상위 SPEC 초안이다. */
export function isManualSpec(id: string): boolean {
  return id.startsWith("spec-manual-");
}

/** 카드 개수가 아니라 실제 셀 높이를 기준으로 브라우저가 필요한 때만 스크롤을 만든다. */
export function daySpecOverflowClass(): "overflow-y-auto" {
  return "overflow-y-auto";
}
