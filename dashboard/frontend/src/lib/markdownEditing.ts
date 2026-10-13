export interface MarkdownEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export function applyMarkdownTab(value: string, selectionStart: number, selectionEnd: number, outdent: boolean): MarkdownEdit {
  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const lineEndIndex = value.indexOf("\n", selectionEnd);
  const lineEnd = lineEndIndex < 0 ? value.length : lineEndIndex;
  const selected = value.slice(lineStart, lineEnd);
  const lines = selected.split("\n");
  if (!outdent) {
    const replacement = lines.map((line) => `  ${line}`).join("\n");
    return {
      value: value.slice(0, lineStart) + replacement + value.slice(lineEnd),
      selectionStart: selectionStart + 2,
      selectionEnd: selectionEnd + lines.length * 2,
    };
  }
  let removedBeforeStart = 0;
  let removedTotal = 0;
  const replacement = lines.map((line, index) => {
    const removed = line.startsWith("  ") ? 2 : line.startsWith("\t") || line.startsWith(" ") ? 1 : 0;
    if (index === 0) removedBeforeStart = Math.min(removed, selectionStart - lineStart);
    removedTotal += removed;
    return line.slice(removed);
  }).join("\n");
  return {
    value: value.slice(0, lineStart) + replacement + value.slice(lineEnd),
    selectionStart: Math.max(lineStart, selectionStart - removedBeforeStart),
    selectionEnd: Math.max(lineStart, selectionEnd - removedTotal),
  };
}

/** 일반 Markdown 편집기처럼 Enter로 현재 목록 표식을 이어간다. 빈 항목이면 목록을 끝낸다. */
export function applyMarkdownEnter(value: string, selectionStart: number, selectionEnd: number): MarkdownEdit | null {
  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const lineEndIndex = value.indexOf("\n", selectionEnd);
  const lineEnd = lineEndIndex < 0 ? value.length : lineEndIndex;
  const beforeCursor = value.slice(lineStart, selectionStart);
  const afterCursor = value.slice(selectionEnd, lineEnd);
  const unordered = beforeCursor.match(/^(\s*)([-+*])\s+(?:(\[[ xX]\])\s+)?(.*)$/);
  const ordered = beforeCursor.match(/^(\s*)(\d+)([.)])\s+(.*)$/);
  if (!unordered && !ordered) return null;

  const content = unordered ? unordered[4] : ordered![4];
  if (!content.trim() && !afterCursor.trim()) {
    const valueWithoutMarker = value.slice(0, lineStart) + value.slice(lineEnd);
    return { value: valueWithoutMarker, selectionStart: lineStart, selectionEnd: lineStart };
  }

  const marker = unordered
    ? `${unordered[1]}${unordered[2]} ${unordered[3] ? "[ ] " : ""}`
    : `${ordered![1]}${Number(ordered![2]) + 1}${ordered![3]} `;
  const replacement = `\n${marker}`;
  const nextCaret = selectionStart + replacement.length;
  return {
    value: value.slice(0, selectionStart) + replacement + value.slice(selectionEnd),
    selectionStart: nextCaret,
    selectionEnd: nextCaret,
  };
}

/** 단독 `---`를 앞 문장의 Setext 제목이 아니라 사용자가 기대한 구분선으로 미리보기한다. */
export function markdownForPreview(markdown: string): string {
  const lines = markdown.split("\n");
  let fenced = false;
  let frontmatter = lines[0]?.trim() === "---";
  return lines.map((line, index) => {
    if (frontmatter && index > 0 && line.trim() === "---") { frontmatter = false; return line; }
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (!frontmatter && !fenced && index > 0 && /^\s*-{3,}\s*$/.test(line) && lines[index - 1].trim() !== "") return `\n${line}`;
    return line;
  }).join("\n");
}
