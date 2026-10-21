import { beforeEach, describe, expect, it, vi } from "vitest";
import { getWeatherRegion, setWeatherRegion, WEATHER_REGIONS } from "./weatherPreferences.js";

describe("weather preferences", () => {
  const values = new Map<string, string>();
  beforeEach(() => {
    values.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
  });

  it("광역 지역만 제공하고 정밀 위치를 저장하지 않는다", () => {
    expect(WEATHER_REGIONS.map((region) => region.id)).toContain("seoul");
    expect(WEATHER_REGIONS.map((region) => region.id)).toContain("gyeonggi");
    expect(WEATHER_REGIONS.every((region) => Number.isFinite(region.latitude) && Number.isFinite(region.longitude))).toBe(true);
  });

  it("선택한 지역을 한 번 저장해 다음 실행에도 사용한다", () => {
    expect(getWeatherRegion()).toBeNull();
    setWeatherRegion("gyeonggi");
    expect(getWeatherRegion()?.label).toBe("경기");
  });
});
