export type WorkspaceCommandIntent = "attention" | "active" | "stable" | "idle";

export interface WorkspaceCommandPulse {
  active: number;
  attention: number;
  done: number;
  total: number;
}

export function workspaceCommandSummary(pulse: WorkspaceCommandPulse): {
  headline: string;
  intent: WorkspaceCommandIntent;
} {
  if (pulse.attention > 0) {
    return {
      headline: `확인이 필요한 작업이 ${pulse.attention}건 있습니다`,
      intent: "attention",
    };
  }
  if (pulse.active > 0) {
    return {
      headline: `${pulse.active}개 워크스페이스가 실행 중입니다`,
      intent: "active",
    };
  }
  if (pulse.total > 0 && pulse.done === pulse.total) {
    return {
      headline: "모든 작업이 안정 상태입니다",
      intent: "stable",
    };
  }
  return {
    headline: "지금 실행 중인 작업이 없습니다",
    intent: "idle",
  };
}

export interface AgendaItem {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
}

export interface AgendaGroup<T extends AgendaItem> {
  id: "overdue" | "today" | "next" | "later";
  label: string;
  description: string;
  items: T[];
}

function addDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function buildScheduleAgenda<T extends AgendaItem>(items: T[], todayKey: string): AgendaGroup<T>[] {
  const nextWeekKey = addDays(todayKey, 7);
  const isOpen = (item: T) => item.status !== "done" && item.status !== "dropped";
  const sorted = [...items]
    .filter((item) => item.due_date && isOpen(item))
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const definitions: Array<Omit<AgendaGroup<T>, "items"> & { match: (item: T) => boolean }> = [
    { id: "overdue", label: "기한 초과", description: "먼저 정리해야 할 일정", match: (item) => isOpen(item) && item.due_date! < todayKey },
    { id: "today", label: "오늘", description: "오늘 결론이 필요한 일정", match: (item) => isOpen(item) && item.due_date === todayKey },
    { id: "next", label: "다음 7일", description: "곧 다가오는 실행 계획", match: (item) => isOpen(item) && item.due_date! > todayKey && item.due_date! <= nextWeekKey },
    { id: "later", label: "이후 일정", description: "장기 실행 계획", match: () => true },
  ];
  const remaining = new Set(sorted);
  return definitions.flatMap((definition) => {
    const groupItems = sorted.filter((item) => remaining.has(item) && definition.match(item));
    groupItems.forEach((item) => remaining.delete(item));
    return groupItems.length > 0 ? [{ id: definition.id, label: definition.label, description: definition.description, items: groupItems }] : [];
  });
}
