import { Marked } from "marked";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

// 작업 요약은 에이전트가 쓴 텍스트라 원시 HTML은 글자로만 보여 주고, 링크는 http(s)만 허용한다.
const summaryMarked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, tokens }) {
      const label = this.parser.parseInline(tokens);
      return /^https?:\/\//i.test(href) ? `<a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${label}</a>` : label;
    },
    image({ text }) {
      return escapeHtml(text);
    },
  },
});

/** work-result 요약(마크다운)을 HTML 리포트용 본문으로 바꾼다. 표·목록·소제목을 지원한다. */
export function workResultSummaryHtml(summary: string): string {
  return summaryMarked.parse(summary, { async: false }) as string;
}
