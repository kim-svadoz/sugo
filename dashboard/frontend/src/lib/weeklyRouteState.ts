export type WeeklyDetailView = "report" | "learning";

export function readWeeklyRouteState(params: URLSearchParams): { weekId: string | null; view: WeeklyDetailView } {
  return { weekId: params.get("week"), view: params.get("view") === "learning" ? "learning" : "report" };
}

export function writeWeeklyRouteState(current: URLSearchParams, weekId: string | null, view: WeeklyDetailView): URLSearchParams {
  const next = new URLSearchParams(current);
  if (!weekId) {
    next.delete("week");
    next.delete("view");
    return next;
  }
  next.set("week", weekId);
  next.set("view", view);
  return next;
}
