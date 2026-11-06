export type MonthCursor = { year: number; month: number };

export function shiftCalendarMonth(cursor: MonthCursor, offset: -1 | 1): MonthCursor {
  const next = new Date(cursor.year, cursor.month + offset, 1);
  return { year: next.getFullYear(), month: next.getMonth() };
}

export function calendarMonthSwipeOffset(deltaX: number, deltaY: number, threshold = 64): -1 | 0 | 1 {
  const horizontal = Math.abs(deltaX);
  if (horizontal < threshold || horizontal <= Math.abs(deltaY) * 1.2) return 0;
  return deltaX < 0 ? 1 : -1;
}
