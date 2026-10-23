export const WEEKLY_PREFERENCES_KEY = "sugo:weekly-preferences";

export interface WeeklyPreferences { enabled: boolean; day: number; hour: number }

export function getWeeklyPreferences(): WeeklyPreferences | null {
  try {
    const value = JSON.parse(localStorage.getItem(WEEKLY_PREFERENCES_KEY) ?? "null") as Partial<WeeklyPreferences> | null;
    if (!value || typeof value.enabled !== "boolean" || !Number.isInteger(value.day) || !Number.isInteger(value.hour)) return null;
    return { enabled: value.enabled, day: Math.min(5, Math.max(1, value.day!)), hour: Math.min(23, Math.max(0, value.hour!)) };
  } catch { return null; }
}

export function setWeeklyPreferences(value: WeeklyPreferences): void {
  localStorage.setItem(WEEKLY_PREFERENCES_KEY, JSON.stringify(value));
  window.dispatchEvent(new Event("sugo:weekly-preferences-changed"));
}
