type HistoryTitleSource = {
  task_title?: string | null;
  summary?: string | null;
  id: string;
};

type HistoryContextSource = {
  spec_title?: string | null;
  task_title?: string | null;
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

/** 보조 제목은 완료 당시 복사본보다 사용자가 계속 수정할 수 있는 현재 SPEC 제목을 따른다. */
export function historyContextTitle(log: HistoryContextSource): string | null {
  return log.spec_title?.trim() || log.task_title?.trim() || null;
}

export function historyDisplayDate(value: string | null | undefined): string {
  if (!value) return "—";
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "—";
  return `${Number(match[1])}년 ${Number(match[2])}월 ${Number(match[3])}일`;
}
