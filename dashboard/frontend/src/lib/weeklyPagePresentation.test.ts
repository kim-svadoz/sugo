import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Weekly index presentation", () => {
  const source = readFileSync(new URL("../pages/WeeklyPage.tsx", import.meta.url), "utf8");

  it("목록과 상세를 오가지 않고 왼쪽 주차 타임라인에서 고른 주를 오른쪽에서 바로 읽는다", () => {
    expect(source).toContain('title="주간 작업 리포트"');
    expect(source).toContain('aria-label="주차 목록"');
    expect(source).toContain("xl:grid-cols-[240px_minmax(0,1fr)]");
    expect(source).toContain("routeState.weekId ?? reports?.[0]?.weekId");
    expect(source).not.toContain("← 주간 보고서 목록");
    expect(source).not.toContain("주간 보고서 달력");
  });

  it("본문은 Sugo 표면의 학습·작업 카드로 그리고, 주차 목록은 접을 수 있다", () => {
    expect(source).not.toContain("aurora-card");
    expect(source).toContain("max-w-[1280px]");
    expect(source).toContain("bg-[#0a101b]");
    expect(source).toContain("function TopicCard(");
    expect(source).toContain("function LearningCard(");
    expect(source).toContain("주차 목록 닫기");
    expect(source).toContain('const RAIL_KEY = "sugo.weekly.railOpen"');
  });

  it("넓은 화면에서 커지는 rem 글자 클래스를 쓰지 않는다", () => {
    expect(source).not.toMatch(/[\s"]text-(xs|sm|base|lg|xl)[\s"]/);
  });

  it("does not reduce weekly blockers to a repeated index count", () => {
    expect(source).not.toContain('["막힌 것", counts?.blocked, true]');
    expect(source).not.toContain("막힌 것 {report.counts.blocked}");
  });
});
