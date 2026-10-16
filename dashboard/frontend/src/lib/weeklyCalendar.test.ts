import { describe, expect, it } from "vitest";
import { buildWeeklyCalendar } from "./weeklyCalendar.js";

describe("Weekly 목록 달력", () => {
  it("보고서 주차를 월요일부터 일요일까지 같은 행으로 만든다", () => {
    const months = buildWeeklyCalendar([
      { weekId: "2026-W41", start: "2026-10-05", end: "2026-10-09" },
      { weekId: "2026-W40", start: "2026-09-28", end: "2026-10-02" },
    ]);
    expect(months.map((month) => month.key)).toEqual(["2026-09", "2026-10"]);
    expect(months[1].weeks.find((week) => week.weekId === "2026-W41")?.days.map((day) => day.day)).toEqual([5, 6, 7, 8, 9, 10, 11]);
  });
});
