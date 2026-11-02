import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Weekly index presentation", () => {
  const source = readFileSync(new URL("../pages/WeeklyPage.tsx", import.meta.url), "utf8");

  it("목록과 상세를 오가지 않고 왼쪽 주차 타임라인에서 고른 주를 오른쪽에서 바로 읽는다", () => {
    expect(source).toContain('title="주간 작업 리포트"');
    expect(source).toContain('aria-label="주차 목록"');
    expect(source).toContain("xl:grid-cols-[280px_minmax(0,1fr)]");
    expect(source).toContain("routeState.weekId ?? reports?.[0]?.weekId");
    expect(source).not.toContain("← 주간 보고서 목록");
    expect(source).not.toContain("주간 보고서 달력");
  });

  it("고른 주의 요약은 오로라 머리에, 본문 카드는 정적 표면에 둔다", () => {
    expect(source).toContain('className="aurora-card rounded-2xl border px-5 py-4"');
    expect(source).toContain("panel-card");
    expect(source).not.toContain("bg-[var(--color-surface)] px-5 py-4");
  });

  it("넓은 화면에서 커지는 rem 글자 클래스를 쓰지 않는다", () => {
    expect(source).not.toMatch(/[\s"]text-(xs|sm|base|lg|xl)[\s"]/);
  });

  it("does not reduce weekly blockers to a repeated index count", () => {
    expect(source).not.toContain('["막힌 것", counts?.blocked, true]');
    expect(source).not.toContain("막힌 것 {report.counts.blocked}");
  });
});
