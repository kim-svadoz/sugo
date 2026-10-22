import type { NewsItem } from "../api/newsApi.js";

export interface TechBriefDay {
  key: string;
  label: string;
  weekday: string;
  count: number;
}

function localDateKey(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildSevenDayFeed(items: NewsItem[], fetchedAt: string, selectedDay?: string, page = 1, pageSize = 10) {
  const anchor = new Date(fetchedAt);
  const days: TechBriefDay[] = Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(anchor);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - offset);
    const key = localDateKey(date);
    return {
      key,
      label: `${date.getMonth() + 1}.${date.getDate()}`,
      weekday: new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(date),
      count: items.filter((item) => localDateKey(item.publishedAt) === key).length,
    };
  });
  const effectiveDay = days.some((day) => day.key === selectedDay) ? selectedDay! : (days.find((day) => day.count > 0)?.key ?? days[0]!.key);
  const dayItems = items.filter((item) => localDateKey(item.publishedAt) === effectiveDay);
  const pageCount = Math.max(1, Math.ceil(dayItems.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  return { days, selectedDay: effectiveDay, items: dayItems.slice((safePage - 1) * pageSize, safePage * pageSize), page: safePage, pageCount };
}
