import type { ActivityEvent } from "../hooks/useActivityStream.js";

export interface ActivitySummary {
  result: string | null;
  stages: string[];
  revisions: number;
}

const STAGE_LABELS: Record<string, string> = {
  CODE: "구현",
  TEST: "테스트",
  REVIEW: "검토",
  DOCS: "문서화",
  MAIN: "완료 정리",
};

function firstSentence(value: string): string {
  return value.split(/\n|(?<=[.!?])\s+/)[0].trim();
}

export function summarizeActivity(events: ActivityEvent[]): ActivitySummary {
  const completed = events.find((event) => event.event_type === "COMPLETED");
  const chronological = events.filter((event) => event.event_type === "HANDOFF").slice().reverse();
  const lastRevision = chronological.map((event) => event.handoff_to).lastIndexOf("CODE");
  const finalFlow = chronological.slice(Math.max(0, lastRevision));
  const stages = (lastRevision >= 0 ? ["CODE", ...finalFlow.slice(1).map((event) => event.handoff_to)] : finalFlow.flatMap((event) => [event.agent, event.handoff_to]))
    .filter((stage): stage is string => Boolean(stage))
    .filter((stage, index, all) => index === 0 || stage !== all[index - 1])
    .map((stage) => stage === "MAIN" && completed ? "커밋" : (STAGE_LABELS[stage] ?? stage));

  return {
    result: completed ? firstSentence(completed.message) : null,
    stages,
    revisions: chronological.filter((event) => event.handoff_to === "CODE").length,
  };
}
