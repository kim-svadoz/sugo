type ScheduleStatusItem = { due_date: string | null; status: string };

/** 카드 색은 워크스페이스 목록 순서가 정본이다. 두 응답 중 하나라도 아직 없으면 임시 색으로
 * 카드를 그리지 않고, 둘 다 준비된 뒤 한 번만 올바른 색으로 표시한다. */
export function schedulePresentationReady(
  specs: readonly unknown[] | null,
  workspaces: readonly unknown[] | null,
): boolean {
  return specs !== null && workspaces !== null;
}

/** Schedule 제목은 오늘부터 앞으로 날짜가 잡힌 SPEC 수를 보여준다. 상태와 기한 미정은 섞지 않는다. */
export function countUpcomingScheduledSpecs(specs: ScheduleStatusItem[], todayKey: string): number {
  return specs.filter((spec) => spec.due_date !== null && spec.due_date >= todayKey).length;
}

export function visibleRegisteredSpecs<T extends ScheduleStatusItem>(specs: T[], todayKey: string): T[] {
  return specs.filter((spec) => spec.due_date !== null && !(spec.status === "done" && spec.due_date < todayKey));
}

/** 카드 본문은 흰색 텍스트를 공통 사용한다. 서로 이웃한 워크스페이스도 한눈에 갈리도록
 * 고유색을 굵은 레일, 외곽선, 표면 그라데이션에 같은 강도로 반복한다. */
export function scheduleCardStyle(color: string) {
  return {
    borderColor: `${color}66`,
    borderLeftColor: color,
    borderLeftWidth: 4,
    background: `linear-gradient(105deg, ${color}2E 0%, ${color}18 72%, ${color}0F 100%)`,
    boxShadow: `inset 0 0 0 1px ${color}33`,
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
