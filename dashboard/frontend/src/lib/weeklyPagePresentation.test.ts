import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Weekly index presentation", () => {
  const source = readFileSync(new URL("../pages/WeeklyPage.tsx", import.meta.url), "utf8");

  it("uses the report title and a single visual affordance instead of repeated link copy", () => {
    expect(source).toContain('title="주간 작업 리포트"');
    expect(source).not.toContain("보고서 열기 →");
    expect(source).toContain("<ArrowRight");
  });
});
