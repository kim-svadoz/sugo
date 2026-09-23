type ScheduleStatusItem = { due_date: string | null; status: string };

export function scheduledOpenCount(specs: ScheduleStatusItem[]): number {
  return specs.filter((spec) => spec.due_date && spec.status !== "done" && spec.status !== "dropped").length;
}

/** 카드 본문은 흰색 텍스트를 공통 사용하고, 워크스페이스 색은 레일과 옅은 표면에만 쓴다. */
export function scheduleCardStyle(color: string) {
  return {
    borderColor: `${color}40`,
    borderLeftColor: color,
    borderLeftWidth: 3,
    backgroundColor: `${color}14`,
  };
}

/** Schedule에서 Run/Task 없이 먼저 만든 최상위 SPEC 초안이다. */
export function isManualSpec(id: string): boolean {
  return id.startsWith("spec-manual-");
}

/** 3개까지는 스크롤 위치가 남아 첫 카드가 잘리지 않게 고정하고, 4개부터만 스크롤한다. */
export function daySpecOverflowClass(count: number): "overflow-hidden" | "overflow-y-auto" {
  return count <= 3 ? "overflow-hidden" : "overflow-y-auto";
}
