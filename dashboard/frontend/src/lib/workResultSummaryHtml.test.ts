import { describe, expect, it } from "vitest";
import { workResultSummaryHtml } from "./workResultSummaryHtml.js";

describe("workResultSummaryHtml", () => {
  it("renders a markdown table as an HTML table", () => {
    const html = workResultSummaryHtml("| 기존 | 신규 |\n|---|---|\n| LegacyRankingModule | NewRankingModule |");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>기존</th>");
    expect(html).toContain("<td>NewRankingModule</td>");
  });

  it("renders headings, lists and bold text", () => {
    const html = workResultSummaryHtml("### 남은 작업\n1. PR 머지\n2. **배포**");
    expect(html).toContain("<h3>남은 작업</h3>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<strong>배포</strong>");
  });

  it("keeps line breaks of legacy plain summaries", () => {
    const html = workResultSummaryHtml("첫 줄이다.\n둘째 줄이다.");
    expect(html).toContain("첫 줄이다.<br>");
  });

  it("escapes raw HTML instead of rendering it", () => {
    const html = workResultSummaryHtml("<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("drops unsafe link targets and keeps the link text", () => {
    const html = workResultSummaryHtml("[열기](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("열기");
  });
});
