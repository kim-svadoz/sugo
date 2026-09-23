export const TASK_CARD_HEIGHT = 130;

export function measuredLeafHeight(level: string): number {
  return level === "task" ? TASK_CARD_HEIGHT : TASK_CARD_HEIGHT / 2;
}
