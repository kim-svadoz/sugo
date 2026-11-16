export interface ReviewPacket {
  round?: number;
  report?: import("../hooks/useRoadmap.js").WorkResultReport;
  summary: string;
  changes: string[];
  tests: string[];
  designDecisions: string[];
  knownLimitations: string[];
  files?: Array<{ path: string; change: "added" | "modified" | "deleted" | "unchanged"; unavailableReason?: string }>;
}

export interface ReviewRound {
  round: number;
  sessionId: string;
  requestedAt: string;
  reviewPacket: ReviewPacket;
  decision: "approve" | "revise";
  response: string;
  answeredAt?: string;
}

/** 지금 보고 있는 세션의 검토 회차. 확인 대기 중이면 그 세션, 아니면 마지막으로 기록된 세션을 쓴다. */
export function currentReviewRounds(rounds: ReviewRound[] | null | undefined, blockerSessionId?: string): ReviewRound[] {
  if (!Array.isArray(rounds) || rounds.length === 0) return [];
  const sessionId = blockerSessionId ?? rounds[rounds.length - 1].sessionId;
  return rounds.filter((round) => round.sessionId === sessionId).sort((a, b) => a.round - b.round);
}

/** 화면 버튼이 앞에 붙이는 "수정 필요 —"를 떼고 사용자가 쓴 요청만 남긴다. */
export function revisionRequestText(response: string): string {
  return response.replace(/^수정 필요\s*—\s*/, "").trim();
}

export function reviewConfirmationSections(packet: ReviewPacket): Array<{ id: string; title: string; items: string[] }> {
  return [
    { id: "summary", title: "작업 요약", items: packet.summary.trim() ? [packet.summary.trim()] : [] },
    { id: "changes", title: "변경 내용", items: packet.changes },
    { id: "tests", title: "검증 결과", items: packet.tests },
    { id: "designDecisions", title: "설계 결정", items: packet.designDecisions },
    { id: "knownLimitations", title: "알려진 한계", items: packet.knownLimitations },
  ].filter((section) => section.items.length > 0);
}
