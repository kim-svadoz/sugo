/** 기존 기록의 단어와 사실은 유지하고 문장 경계만 화면용으로 정돈한다. */
export function presentSteKorean(text: string, paragraphBreak = false): string {
  const separator = paragraphBreak ? "\n\n" : "\n";
  let inFence = false;
  return text.replace(/\r\n?/g, "\n").split("\n").map((line) => {
    if (/^\s*(?:```|~~~)/u.test(line)) {
      inFence = !inFence;
      return line;
    }
    return inFence ? line : splitProseLine(line).join(separator);
  }).join("\n").trim();
}

function splitProseLine(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed || /^(?:```|~~~|#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\|)/u.test(trimmed)) return [line];
  return line.split(/(?<=[.!?])\s+(?=\S)/u);
}
