import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scheduleCardStyle, scheduledOpenCount } from "./schedulePresentation.js";

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
});
