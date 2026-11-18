/**
 * 알람처럼 "오전/오후 · 시 · 분" 세 휠로 시각을 고르기 위한 순수 변환.
 * 서버 계약은 24시간제 정수(hour 0~23, minute 0~59)다. 휠은 목록 안의 값만 내보내므로
 * 보정은 서버에서 받은 값을 휠에 올릴 때(toWheelTime) 한 번만 한다.
 */

export type Meridiem = "am" | "pm";

export interface WheelTime {
  meridiem: Meridiem;
  /** 1~12 */
  hour12: number;
  /** 0~59 */
  minute: number;
}

export const MERIDIEMS: readonly Meridiem[] = ["am", "pm"];
export const HOURS_12: readonly number[] = Array.from({ length: 12 }, (_, i) => i + 1);
export const MINUTES: readonly number[] = Array.from({ length: 60 }, (_, i) => i);

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** 24시간제 → 휠. 범위를 벗어나거나 숫자가 아니면 기본값(오후 5:00)으로 안전하게 보정한다. */
export function toWheelTime(hour: unknown, minute: unknown): WheelTime {
  const h = clampInt(hour, 0, 23, 17);
  return {
    meridiem: h < 12 ? "am" : "pm",
    hour12: h % 12 === 0 ? 12 : h % 12,
    minute: clampInt(minute, 0, 59, 0),
  };
}

/** 휠 → 24시간제. 오전 12시는 0시, 오후 12시는 12시다. */
export function fromWheelTime(time: WheelTime): { hour: number; minute: number } {
  const base = time.hour12 % 12;
  return { hour: time.meridiem === "pm" ? base + 12 : base, minute: time.minute };
}

/** "오후 5:00" 같은 사람이 읽는 표기. */
export function formatWheelTime(hour: unknown, minute: unknown): string {
  const t = toWheelTime(hour, minute);
  return `${t.meridiem === "am" ? "오전" : "오후"} ${t.hour12}:${String(t.minute).padStart(2, "0")}`;
}

/** 스크롤 위치 → 항목 인덱스. 스냅 도중의 어중간한 위치도 가장 가까운 항목으로, 범위 밖은 끝 항목으로 붙인다. */
export function indexFromScroll(scrollTop: number, itemHeight: number, count: number): number {
  if (count <= 0 || !(itemHeight > 0) || !Number.isFinite(scrollTop)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollTop / itemHeight)));
}
