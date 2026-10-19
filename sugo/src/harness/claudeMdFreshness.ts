/**
 * `writeClaudeIfChanged` — sugo/CLAUDE.md는 매 sync마다 다시 합성되는데, 하네스
 * 내용이 안 바뀌었으면 재기록을 생략해 불필요한 git diff를 안 만든다. compose()는 순수함수로
 * 남겨야 해서(harnessComposer.test.ts가 전제) 타임스탬프는 이 IO 경계 계층에서 따로 붙인다.
 */

const FRESHNESS_PREFIX = "> 적용 하네스 최근 변경: ";

function freshnessLine(dateIso: string): string {
  return `${FRESHNESS_PREFIX}${dateIso}\n\n`;
}

/** 기존 파일에서 신선도 줄을 걷어내 순수 본문만 남긴다. sugo가 안 쓴 파일이면 그대로 돌려준다. */
function stripFreshnessLine(content: string): string {
  if (!content.startsWith(FRESHNESS_PREFIX)) return content;
  const idx = content.indexOf("\n\n");
  return idx === -1 ? content : content.slice(idx + 2);
}

export interface WriteClaudeResult {
  content: string;
  changed: boolean;
}

/**
 * `existing`(현재 디스크의 sugo/CLAUDE.md, 없으면 null)과 새로 합성된 본문(`nextBody`, 타임스탬프
 * 없는 순수 compose() 출력)을 비교한다. 본문이 같으면 기존 파일을 **그대로** 돌려준다 — 새
 * 타임스탬프로 덮어쓰지 않는다. 그래서 이 줄은 "마지막 실행 시각"이 아니라 "마지막으로 실제
 * 바뀐 시각"을 뜻한다 — 재실행만 반복하는 것보다 더 쓸모 있는 정보다.
 */
export function writeClaudeIfChanged(existing: string | null, nextBody: string, nowIso: string): WriteClaudeResult {
  if (existing !== null && stripFreshnessLine(existing) === nextBody) {
    return { content: existing, changed: false };
  }
  return { content: freshnessLine(nowIso) + nextBody, changed: true };
}
