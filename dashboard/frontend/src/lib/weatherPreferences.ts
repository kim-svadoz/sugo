export interface WeatherRegion {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}

export const WEATHER_REGION_KEY = "sugo_weather_region";
export const WEATHER_REGION_CHANGED = "sugo:weather-region-changed";

export const WEATHER_REGIONS: readonly WeatherRegion[] = [
  { id: "seoul-cityhall", label: "서울특별시 · 시청", latitude: 37.5665, longitude: 126.9780 },
  { id: "suwon", label: "경기도 · 수원", latitude: 37.2636, longitude: 127.0286 },
  { id: "seongnam", label: "경기도 · 성남", latitude: 37.4200, longitude: 127.1265 },
  { id: "goyang", label: "경기도 · 고양", latitude: 37.6584, longitude: 126.8320 },
  { id: "incheon", label: "인천광역시", latitude: 37.4563, longitude: 126.7052 },
  { id: "chuncheon", label: "강원특별자치도 · 춘천", latitude: 37.8813, longitude: 127.7298 },
  { id: "gangneung", label: "강원특별자치도 · 강릉", latitude: 37.7519, longitude: 128.8761 },
  { id: "daejeon", label: "대전광역시", latitude: 36.3504, longitude: 127.3845 },
  { id: "sejong", label: "세종특별자치시", latitude: 36.4800, longitude: 127.2890 },
  { id: "cheongju", label: "충청북도 · 청주", latitude: 36.6424, longitude: 127.4890 },
  { id: "cheonan", label: "충청남도 · 천안", latitude: 36.8151, longitude: 127.1139 },
  { id: "jeonju", label: "전북특별자치도 · 전주", latitude: 35.8242, longitude: 127.1480 },
  { id: "gwangju", label: "광주광역시", latitude: 35.1595, longitude: 126.8526 },
  { id: "daegu", label: "대구광역시", latitude: 35.8714, longitude: 128.6014 },
  { id: "busan", label: "부산광역시", latitude: 35.1796, longitude: 129.0756 },
  { id: "ulsan", label: "울산광역시", latitude: 35.5384, longitude: 129.3114 },
  { id: "changwon", label: "경상남도 · 창원", latitude: 35.2279, longitude: 128.6811 },
  { id: "pohang", label: "경상북도 · 포항", latitude: 36.0190, longitude: 129.3435 },
  { id: "jeju", label: "제주특별자치도 · 제주시", latitude: 33.4996, longitude: 126.5312 },
  { id: "seogwipo", label: "제주특별자치도 · 서귀포", latitude: 33.2541, longitude: 126.5601 },
] as const;

export function getWeatherRegion(): WeatherRegion | null {
  const stored = localStorage.getItem(WEATHER_REGION_KEY);
  const legacy: Record<string, string> = { seoul: "seoul-cityhall", gyeonggi: "suwon", gangwon: "chuncheon", chungcheong: "cheongju", "daejeon-sejong": "daejeon", jeolla: "jeonju", gyeongsang: "changwon", "busan-ulsan": "busan" };
  const id = stored ? legacy[stored] ?? stored : null;
  return WEATHER_REGIONS.find((region) => region.id === id) ?? null;
}

export function setWeatherRegion(id: string): void {
  const region = WEATHER_REGIONS.find((candidate) => candidate.id === id);
  if (!region) throw new Error(`지원하지 않는 날씨 지역: ${id}`);
  localStorage.setItem(WEATHER_REGION_KEY, region.id);
  window.dispatchEvent(new Event(WEATHER_REGION_CHANGED));
}
