export const SCHEDULE_DRAG_TYPE = "application/x-sugo-scheduled-spec";

export type ScheduleDragPayload = { workspaceName: string; id: string };

export function encodeScheduleDrag(payload: ScheduleDragPayload): string {
  return JSON.stringify(payload);
}

export function decodeScheduleDrag(raw: string): ScheduleDragPayload | null {
  try {
    const value = JSON.parse(raw) as Partial<ScheduleDragPayload>;
    if (typeof value.workspaceName !== "string" || !value.workspaceName) return null;
    if (typeof value.id !== "string" || !value.id) return null;
    return { workspaceName: value.workspaceName, id: value.id };
  } catch {
    return null;
  }
}
