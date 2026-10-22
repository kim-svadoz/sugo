import type { ActivityEvent } from "../hooks/useActivityStream.js";

export interface ActivitySummary {
  result: string[];
  stages: Array<{ label: string; status: "complete" | "active" | "pending" }>;
  revisions: number;
  currentLabel: string;
}

function resultLines(value: string): string[] {
  return value.split(/\n+|;\s*|(?<=[.!?])\s+/).map((line) => line.trim()).filter(Boolean).slice(0, 4);
}

export function summarizeActivity(events: ActivityEvent[]): ActivitySummary {
  const completed = events.find((event) => event.event_type === "COMPLETED");
  const chronological = events.filter((event) => event.event_type === "HANDOFF").slice().reverse();
  const lastRevision = chronological.map((event) => event.handoff_to).lastIndexOf("CODE");
  const finalFlow = chronological.slice(Math.max(0, lastRevision));
  const confirmation = events.find((event) => event.event_type === "SYSTEM" && typeof event.details === "object" && event.details !== null && (event.details as { phase?: string }).phase === "user_confirmation");
  const latestHandoff = events.find((event) => event.event_type === "HANDOFF");
  const waitingConfirmation = Boolean(confirmation && (!latestHandoff || confirmation.id > latestHandoff.id));
  const lastTarget = finalFlow.at(-1)?.handoff_to ?? finalFlow.at(-1)?.agent ?? null;
  const labels = ["구현", "테스트", "검토", "사용자 확인", "문서화", "커밋"];
  const activeIndex = completed ? labels.length : waitingConfirmation ? 3 : lastTarget === "CODE" ? 0 : lastTarget === "TEST" ? 1 : lastTarget === "REVIEW" ? 3 : lastTarget === "DOCS" ? 4 : lastTarget === "MAIN" ? 5 : 0;
  const stages = labels.map((label, index) => ({ label, status: (completed || index < activeIndex ? "complete" : index === activeIndex ? "active" : "pending") as "complete" | "active" | "pending" }));

  return {
    result: completed ? resultLines(completed.message) : resultLines((waitingConfirmation ? confirmation?.message : undefined) ?? events[0]?.message ?? ""),
    stages,
    revisions: chronological.filter((event) => event.handoff_to === "CODE").length,
    currentLabel: completed ? "모든 단계 완료" : waitingConfirmation || lastTarget === "REVIEW" ? "사용자 확인 대기" : `${labels[activeIndex]} 진행 중`,
  };
}
