export interface WeeklyCalendarSource {
  weekId: string;
  start: string;
  end: string;
}

export interface WeeklyCalendarDay {
  day: number;
  inMonth: boolean;
  weekend: boolean;
}

export interface WeeklyCalendarWeek {
  weekId: string | null;
  weekNumber: number;
  days: WeeklyCalendarDay[];
}

export interface WeeklyCalendarMonth {
  key: string;
  label: string;
  weeks: WeeklyCalendarWeek[];
}

const DAY = 86_400_000;

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function isoWeek(date: Date): number {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return Math.ceil(((value.getTime() - yearStart.getTime()) / DAY + 1) / 7);
}

export function buildWeeklyCalendar(reports: WeeklyCalendarSource[]): WeeklyCalendarMonth[] {
  if (reports.length === 0) return [];
  const byMonday = new Map(reports.map((report) => [report.start, report.weekId]));
  const starts = reports.map((report) => utcDate(report.start)).sort((a, b) => a.getTime() - b.getTime());
  const first = new Date(Date.UTC(starts[0].getUTCFullYear(), starts[0].getUTCMonth(), 1));
  const lastStart = starts.at(-1) ?? first;
  const last = new Date(Date.UTC(lastStart.getUTCFullYear(), lastStart.getUTCMonth(), 1));
  const months: WeeklyCalendarMonth[] = [];
  for (let month = new Date(first); month <= last; month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1))) {
    const monthIndex = month.getUTCMonth();
    const firstDay = new Date(month);
    const offset = (firstDay.getUTCDay() + 6) % 7;
    let monday = new Date(firstDay.getTime() - offset * DAY);
    const weeks: WeeklyCalendarWeek[] = [];
    do {
      const mondayKey = monday.toISOString().slice(0, 10);
      weeks.push({
        weekId: byMonday.get(mondayKey) ?? null,
        weekNumber: isoWeek(monday),
        days: Array.from({ length: 7 }, (_, index) => {
          const date = new Date(monday.getTime() + index * DAY);
          return { day: date.getUTCDate(), inMonth: date.getUTCMonth() === monthIndex, weekend: index >= 5 };
        }),
      });
      monday = new Date(monday.getTime() + 7 * DAY);
    } while (monday.getUTCMonth() === monthIndex);
    months.push({ key: month.toISOString().slice(0, 7), label: `${month.getUTCFullYear()}년 ${monthIndex + 1}월`, weeks });
  }
  return months;
}
