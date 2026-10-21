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

  it("광역 단위가 아닌 사용자가 알아볼 수 있는 대표 도시를 제공한다", () => {
    expect(WEATHER_REGIONS.map((region) => region.id)).toContain("seoul-cityhall");
    expect(WEATHER_REGIONS.find((region) => region.id === "seoul-gangnam")?.label).toBe("서울특별시 · 강남");
    expect(WEATHER_REGIONS.map((region) => region.id)).toContain("suwon");
    expect(WEATHER_REGIONS.find((region) => region.id === "suwon")?.label).toBe("경기도 · 수원");
    expect(WEATHER_REGIONS.every((region) => Number.isFinite(region.latitude) && Number.isFinite(region.longitude))).toBe(true);
  });

  it("선택한 지역을 한 번 저장해 다음 실행에도 사용한다", () => {
    expect(getWeatherRegion()).toBeNull();
    setWeatherRegion("suwon");
    expect(getWeatherRegion()?.label).toBe("경기도 · 수원");
  });

  it("기존 광역 설정은 가까운 대표 도시로 이어받는다", () => {
    values.set("sugo_weather_region", "seoul");
    expect(getWeatherRegion()?.label).toBe("서울특별시 · 시청");
  });
});
