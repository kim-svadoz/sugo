/** Activity DATETIME strings are stored in UTC even when the DB omits the offset. */
export function parseActivityTime(ts: string): Date {
  const normalized = ts.trim().replace(" ", "T");
  const utc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(normalized)
    ? `${normalized}Z` : normalized;
  return new Date(utc);
}

export function formatActivityTime(ts: string): string {
  const date = parseActivityTime(ts);
  if (!Number.isFinite(date.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  return `${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}
