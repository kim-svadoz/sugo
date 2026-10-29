/** "가이드 보지 않기"를 누른 날짜(YYYY-MM-DD). 그날 하루만 시작 안내를 숨기고, 다음 날 아직 처음 사용자면 다시 보여 준다. */
export const TOUR_HIDDEN_ON_KEY = "sugo.onboarding.tour.hiddenOn";

export function localDayKey(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function isTourHiddenToday(hiddenOn: string | null, now: Date): boolean {
  return hiddenOn === localDayKey(now);
}
