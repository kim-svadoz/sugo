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
