import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Weekly index presentation", () => {
  const source = readFileSync(new URL("../pages/WeeklyPage.tsx", import.meta.url), "utf8");

  it("uses the report title and a single visual affordance instead of repeated link copy", () => {
    expect(source).toContain('title="주간 작업 리포트"');
    expect(source).not.toContain("보고서 열기 →");
    expect(source).toContain("<ArrowRight");
  });

  it("keeps the weekly index readable at laptop and wide-monitor widths", () => {
    expect(source).toContain("mx-auto w-full max-w-[1680px]");
    expect(source).toContain("min-[1100px]:grid-cols-[minmax(0,1fr)_clamp(280px,22vw,330px)]");
    expect(source).toContain("px-4 py-3");
    expect(source).toContain("text-[12.5px] leading-5");
    expect(source).toContain("font-mono text-[11px]");
  });

  it("does not reduce weekly blockers to a repeated index count", () => {
    expect(source).not.toContain('["막힌 것", counts?.blocked, true]');
    expect(source).not.toContain("막힌 것 {report.counts.blocked}");
  });
});
