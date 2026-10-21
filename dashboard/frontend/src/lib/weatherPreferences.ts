export interface WeatherRegion {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

export const WEATHER_REGION_KEY = "sugo_weather_region";
export const WEATHER_REGION_CHANGED = "sugo:weather-region-changed";

export const WEATHER_REGIONS: readonly WeatherRegion[] = [
  { id: "seoul", label: "서울", latitude: 37.5665, longitude: 126.9780 },
  { id: "gyeonggi", label: "경기", latitude: 37.4138, longitude: 127.5183 },
  { id: "incheon", label: "인천", latitude: 37.4563, longitude: 126.7052 },
  { id: "gangwon", label: "강원", latitude: 37.8228, longitude: 128.1555 },
  { id: "chungcheong", label: "충청", latitude: 36.6357, longitude: 127.4917 },
  { id: "daejeon-sejong", label: "대전·세종", latitude: 36.4178, longitude: 127.3847 },
  { id: "jeolla", label: "전라", latitude: 35.7175, longitude: 127.1530 },
  { id: "gwangju", label: "광주", latitude: 35.1595, longitude: 126.8526 },
  { id: "gyeongsang", label: "경상", latitude: 36.4919, longitude: 128.8889 },
  { id: "busan-ulsan", label: "부산·울산", latitude: 35.3596, longitude: 129.0331 },
  { id: "daegu", label: "대구", latitude: 35.8714, longitude: 128.6014 },
  { id: "jeju", label: "제주", latitude: 33.4996, longitude: 126.5312 },
] as const;

export function getWeatherRegion(): WeatherRegion | null {
  const id = localStorage.getItem(WEATHER_REGION_KEY);
  return WEATHER_REGIONS.find((region) => region.id === id) ?? null;
}

export function setWeatherRegion(id: string): void {
  const region = WEATHER_REGIONS.find((candidate) => candidate.id === id);
  if (!region) throw new Error(`지원하지 않는 날씨 지역: ${id}`);
  localStorage.setItem(WEATHER_REGION_KEY, region.id);
  window.dispatchEvent(new Event(WEATHER_REGION_CHANGED));
}
