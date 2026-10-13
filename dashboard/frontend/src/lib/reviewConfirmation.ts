export interface ReviewPacket {
  summary: string;
  changes: string[];
  tests: string[];
  designDecisions: string[];
  knownLimitations: string[];
  files?: Array<{ path: string; change: "added" | "modified" | "deleted" | "unchanged"; unavailableReason?: string }>;
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
