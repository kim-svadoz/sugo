/** §7B Schedule 탭 — SchedulePage와 DatePicker가 같은 그리드 로직을 쓰도록 공용화했다. */
import { krHolidayName } from "./krHolidays.js";

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 6주 x 7일 고정 그리드 — 이번 달이 앞뒤로 몇 칸 걸치든 레이아웃이 안 흔들린다. */
export function buildMonthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/**
 * "오늘"을 브라우저 로컬 타임존이 아니라 **KST(Asia/Seoul) 기준**으로 고정한다.
 * 사용자가 다른 시간대 PC에서 열어도 마감일 임박/초과 판정이 흔들리면 안 된다.
 * 반환값은 로컬 Date 객체이지만 연/월/일 필드는 항상 서울 기준이다 — 이 파일의
 * 나머지 함수(toDateKey/buildMonthGrid)가 전부 로컬 Y/M/D 필드로만 동작하므로
 * UTC 변환 없이 그대로 섞어 써도 된다.
 */
export function nowKST(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  return new Date(get("year"), get("month") - 1, get("day"));
}

/** 일요일/공휴일=빨강, 토요일=파랑, 평일=기본. 날짜 숫자·요일 라벨 색에 같이 쓴다. */
export function dayAccentClass(d: Date): string {
  const holiday = krHolidayName(toDateKey(d));
  if (d.getDay() === 0 || holiday) return "text-rose-400";
  if (d.getDay() === 6) return "text-blue-400";
  return "";
}
