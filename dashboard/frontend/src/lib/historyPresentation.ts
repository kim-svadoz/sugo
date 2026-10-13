type HistoryTitleSource = {
  task_title?: string | null;
  summary?: string | null;
  id: string;
};

const GENERIC_SUMMARY_LABEL = /^(?:작업\s*요약|summary)$/i;

/** History의 주 제목은 기능 폴더명이 아니라 실제 완료 작업을 설명해야 한다. */
export function historyDisplayTitle(log: HistoryTitleSource): string {
  const meaningfulLine = log.summary
    ?.split(/\r?\n/)
    .map((line) => line.trim().replace(/^#{1,6}\s*/, "").replace(/^(?:[-*+]\s+|\d+[.)]\s+)/, "").trim())
    .find((line) => line.length > 0 && !GENERIC_SUMMARY_LABEL.test(line));

  if (meaningfulLine) {
    return meaningfulLine.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? meaningfulLine;
  }
  return log.task_title?.trim() || log.id;
}
