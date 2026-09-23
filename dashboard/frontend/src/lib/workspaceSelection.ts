export const WORKSPACE_CARD_FOCUS_CLASSES =
  "focus-visible:outline-none focus-visible:bg-cyan-400/[0.07]";

export function workspaceCardShadow(color: string, selected: boolean): string {
  const identity = `inset 3px 0 0 ${color}`;
  return selected
    ? `${identity}, 0 12px 28px rgba(0,0,0,0.24)`
    : identity;
}
