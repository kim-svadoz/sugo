export const SCHEDULE_DRAG_TYPE = "application/x-sugo-schedule-item";

export type ScheduleDragPayload =
  | { kind: "spec"; workspaceName: string; id: string }
  | { kind: "commitment"; id: string }
  | { kind: "memo"; id: string };

export function encodeScheduleDrag(payload: ScheduleDragPayload): string {
  return JSON.stringify(payload);
}

export function decodeScheduleDrag(raw: string): ScheduleDragPayload | null {
  try {
    const value = JSON.parse(raw) as Partial<ScheduleDragPayload>;
    if (typeof value.id !== "string" || !value.id) return null;
    if (value.kind === "memo" || value.kind === "commitment") return { kind: value.kind, id: value.id };
    if (value.kind !== "spec" || !("workspaceName" in value) || typeof value.workspaceName !== "string" || !value.workspaceName) return null;
    return { kind: "spec", workspaceName: value.workspaceName, id: value.id };
  } catch {
    return null;
  }
}
