import { expect, it } from "vitest";
import { formatWheelTime, fromWheelTime, HOURS_12, indexFromScroll, MINUTES, toWheelTime } from "./timeWheel.js";

it("round-trips every minute of the day through the three wheels", () => {
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute++) {
      expect(fromWheelTime(toWheelTime(hour, minute))).toEqual({ hour, minute });
    }
  }
});

it("maps the midnight and noon edges the way an alarm clock does", () => {
  expect(toWheelTime(0, 0)).toEqual({ meridiem: "am", hour12: 12, minute: 0 });
  expect(toWheelTime(12, 30)).toEqual({ meridiem: "pm", hour12: 12, minute: 30 });
  expect(fromWheelTime({ meridiem: "am", hour12: 12, minute: 5 })).toEqual({ hour: 0, minute: 5 });
  expect(fromWheelTime({ meridiem: "pm", hour12: 12, minute: 5 })).toEqual({ hour: 12, minute: 5 });
});

it("puts a missing or broken stored time on the wheels as a valid time, never NaN", () => {
  for (const bad of [NaN, undefined, null, "17", Infinity, -Infinity]) {
    const out = fromWheelTime(toWheelTime(bad, bad));
    expect(Number.isInteger(out.hour)).toBe(true);
    expect(Number.isInteger(out.minute)).toBe(true);
  }
  expect(fromWheelTime(toWheelTime(NaN, NaN))).toEqual({ hour: 17, minute: 0 });
});

it("clamps out-of-range values instead of wrapping them", () => {
  expect(fromWheelTime(toWheelTime(99, 99))).toEqual({ hour: 23, minute: 59 });
  expect(fromWheelTime(toWheelTime(-5, -5))).toEqual({ hour: 0, minute: 0 });
});

it("formats the chosen time in Korean alarm style", () => {
  expect(formatWheelTime(17, 0)).toBe("오후 5:00");
  expect(formatWheelTime(0, 7)).toBe("오전 12:07");
  expect(formatWheelTime(9, 30)).toBe("오전 9:30");
});

it("snaps a scroll offset to the nearest item and stays inside the list", () => {
  expect(indexFromScroll(0, 40, 12)).toBe(0);
  expect(indexFromScroll(59, 40, 12)).toBe(1);
  expect(indexFromScroll(61, 40, 12)).toBe(2);
  expect(indexFromScroll(10_000, 40, 12)).toBe(11);
  expect(indexFromScroll(-30, 40, 12)).toBe(0);
  expect(indexFromScroll(NaN, 40, 12)).toBe(0);
  expect(indexFromScroll(100, 0, 12)).toBe(0);
  expect(indexFromScroll(100, 40, 0)).toBe(0);
});

it("offers the full 12-hour and 60-minute ranges", () => {
  expect(HOURS_12).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  expect(MINUTES.length).toBe(60);
  expect(MINUTES[0]).toBe(0);
  expect(MINUTES[59]).toBe(59);
});
