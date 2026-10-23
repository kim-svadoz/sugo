import { beforeEach, describe, expect, it, vi } from "vitest";
import { getWeeklyPreferences, setWeeklyPreferences } from "./weeklyPreferences.js";

describe("weekly preferences", () => {
  const values = new Map<string, string>();
  beforeEach(() => { values.clear(); vi.stubGlobal("localStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }); vi.stubGlobal("window", { dispatchEvent: vi.fn() }); });
  it("설정 전에는 미완료이고 저장 뒤에는 자동 정리 설정을 읽는다", () => {
    expect(getWeeklyPreferences()).toBeNull();
    setWeeklyPreferences({ enabled: true, day: 5, hour: 17 });
    expect(getWeeklyPreferences()).toEqual({ enabled: true, day: 5, hour: 17 });
  });
});
