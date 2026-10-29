import { describe, expect, it } from "vitest";
import { isTourHiddenToday, localDayKey } from "./onboardingTourVisibility.js";

describe("시작 안내 하루 숨김", () => {
  it("숨긴 날짜는 사용자 컴퓨터의 날짜로 기록한다", () => {
    expect(localDayKey(new Date(2026, 9, 29, 23, 59))).toBe("2026-10-29");
    expect(localDayKey(new Date(2026, 0, 3, 0, 0))).toBe("2026-01-03");
  });

  it("숨긴 그날에는 보이지 않는다", () => {
    expect(isTourHiddenToday("2026-10-29", new Date(2026, 9, 29, 9, 0))).toBe(true);
    expect(isTourHiddenToday("2026-10-29", new Date(2026, 9, 29, 23, 59))).toBe(true);
  });

  it("다음 날 0시가 지나면 다시 보인다", () => {
    expect(isTourHiddenToday("2026-10-29", new Date(2026, 9, 30, 0, 0))).toBe(false);
  });

  it("숨긴 적이 없거나 값이 이상하면 보인다", () => {
    expect(isTourHiddenToday(null, new Date(2026, 9, 29))).toBe(false);
    expect(isTourHiddenToday("true", new Date(2026, 9, 29))).toBe(false);
  });
});
