/**
 * 원문 단어와 사실은 유지하고, 한 줄에 한 문장만 오도록 문장 경계만 정돈한다.
 * 의미·태·용어 적합성은 작성 에이전트의 STE-inspired Korean 규칙이 책임진다.
 */
export function formatSteInspiredKorean(text: string): string {
  let inFence = false;
  return text.replace(/\r\n?/g, "\n").split("\n").map((line) => {
    if (/^\s*(?:```|~~~)/u.test(line)) {
      inFence = !inFence;
      return line;
    }
    return inFence ? line : splitProseLine(line).join("\n");
  }).join("\n").trim();
}

function splitProseLine(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed || isMarkdownStructure(trimmed)) return [line];
  return line.split(/(?<=[.!?])\s+(?=\S)/u);
}

function isMarkdownStructure(line: string): boolean {
  return /^(?:```|~~~|#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\|)/u.test(line);
}
