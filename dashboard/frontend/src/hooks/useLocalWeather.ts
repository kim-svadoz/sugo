import { useCallback, useEffect, useState } from "react";
import { getWeatherRegion, WEATHER_REGION_CHANGED, type WeatherRegion } from "../lib/weatherPreferences.js";

export interface LocalWeather { temperature: number; label: string }

const WEATHER_LABELS: Record<number, string> = { 0: "맑음", 1: "대체로 맑음", 2: "구름 조금", 3: "흐림", 45: "안개", 48: "안개", 51: "이슬비", 53: "이슬비", 55: "이슬비", 61: "비", 63: "비", 65: "강한 비", 71: "눈", 73: "눈", 75: "강한 눈", 80: "소나기", 81: "소나기", 82: "강한 소나기", 95: "뇌우" };

export function useLocalWeather(enabled: boolean): { weather: LocalWeather | null; region: WeatherRegion | null } {
  const [weather, setWeather] = useState<LocalWeather | null>(null);
  const [region, setRegion] = useState(getWeatherRegion);
  const refreshRegion = useCallback(() => setRegion(getWeatherRegion()), []);
  useEffect(() => {
    window.addEventListener(WEATHER_REGION_CHANGED, refreshRegion);
    window.addEventListener("storage", refreshRegion);
    return () => {
      window.removeEventListener(WEATHER_REGION_CHANGED, refreshRegion);
      window.removeEventListener("storage", refreshRegion);
    };
  }, [refreshRegion]);
  useEffect(() => {
    if (!enabled || !region) { setWeather(null); return; }
    let cancelled = false;
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(region.latitude));
    url.searchParams.set("longitude", String(region.longitude));
    url.searchParams.set("current", "temperature_2m,weather_code");
    url.searchParams.set("timezone", "Asia/Seoul");
    fetch(url, { signal: AbortSignal.timeout(5000) })
      .then((response) => {
        if (!response.ok) throw new Error(`weather HTTP ${response.status}`);
        return response.json() as Promise<{ current: { temperature_2m: number; weather_code: number } }>;
      })
      .then(({ current }) => {
        if (!cancelled) setWeather({ temperature: Math.round(current.temperature_2m), label: WEATHER_LABELS[current.weather_code] ?? "현재 날씨" });
      })
      .catch(() => { /* 날씨는 보조 정보다. 외부 API 실패 시 날짜와 설정 지역만 유지한다. */ });
    return () => { cancelled = true; };
  }, [enabled, region]);
  return { weather, region };
}
