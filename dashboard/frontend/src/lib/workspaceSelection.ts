export function workspaceCardShadow(color: string, selected: boolean): string {
  const identity = `inset 3px 0 0 ${color}`;
  return selected ? `${identity}, 0 0 0 2px rgba(34,211,238,0.7), 0 10px 28px rgba(34,211,238,0.12)` : identity;
}
