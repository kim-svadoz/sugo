import { describe, expect, it } from "vitest";
import { calendarMonthSwipeOffset, shiftCalendarMonth } from "./calendarMonthSwipe.js";

describe("calendar month swipe", () => {
  it("moves to the next month after a deliberate left drag", () => {
    expect(calendarMonthSwipeOffset(-90, 12)).toBe(1);
  });

  it("moves to the previous month after a deliberate right drag", () => {
    expect(calendarMonthSwipeOffset(90, 12)).toBe(-1);
  });

  it("ignores short movement and vertical scrolling", () => {
    expect(calendarMonthSwipeOffset(-30, 2)).toBe(0);
    expect(calendarMonthSwipeOffset(-80, 100)).toBe(0);
  });

  it("crosses year boundaries", () => {
    expect(shiftCalendarMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2027, month: 0 });
    expect(shiftCalendarMonth({ year: 2026, month: 0 }, -1)).toEqual({ year: 2025, month: 11 });
  });
});
