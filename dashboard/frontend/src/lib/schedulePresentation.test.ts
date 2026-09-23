import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isManualSpec, scheduleCardStyle, scheduledOpenCount } from "./schedulePresentation.js";

describe("schedule presentation", () => {
  it("마감일이 있고 아직 끝나지 않은 Spec만 제목 개수에 포함한다", () => {
    expect(scheduledOpenCount([
      { due_date: "2026-09-23", status: "pending" },
      { due_date: "2026-09-24", status: "in_progress" },
      { due_date: "2026-09-25", status: "done" },
      { due_date: null, status: "pending" },
      { due_date: "2026-09-26", status: "dropped" },
    ])).toBe(2);
  });

  it("워크스페이스 색은 왼쪽 레일과 옅은 배경에만 쓰고 글자색은 지정하지 않는다", () => {
    const style = scheduleCardStyle("#fb923c");
    expect(style.borderLeftColor).toBe("#fb923c");
    expect(style.backgroundColor).toBe("#fb923c14");
    expect(style).not.toHaveProperty("color");
  });

  it("기한 초과는 외곽선 대신 명시적인 경고 배지로 표시한다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain("기한 초과");
    expect(source).not.toContain('overdue && "ring-1 ring-rose-400"');
  });

  it("대시보드에서 먼저 만든 SPEC 초안을 구분한다", () => {
    expect(isManualSpec("spec-manual-a1b2c3d4")).toBe(true);
    expect(isManualSpec("spec-feature-checkout")).toBe(false);
  });

  it("날짜 칸은 SPEC 3개 높이를 확보하고 초과분만 내부 스크롤한다", () => {
    const source = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(source).toContain("min-h-7 shrink-0");
    expect(source).toContain("overflow-y-auto");
  });
});
