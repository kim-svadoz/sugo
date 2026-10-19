export const WORKSPACE_CARD_FOCUS_CLASSES =
  "focus-visible:outline-none focus-visible:bg-cyan-400/[0.07]";

/**
 * 도메인 색 팔레트. **이름이 아니라 목록 순서(index)로** 고른다 — 이름 해시로 고르면
 * 도메인이 하나 늘 때마다 기존 도메인 색이 같이 뒤바뀌어, 색으로 기억한 사람을 배신한다.
 * 워크스페이스 색은 모든 화면에서 같아야 하므로 여기서만 계산한다.
 */
export const WORKSPACE_COLORS = [
  "#d979a1", "#c9a24f", "#9484d8", "#62ad91", "#cf7c5d",
  "#c878aa", "#8cab5a", "#7188c9", "#c56878", "#a276c4",
];
export function getWorkspaceColor(_name: string, index: number): string {
  return WORKSPACE_COLORS[index % WORKSPACE_COLORS.length];
}

/** Schedule 칩 — Tailwind 팔레트 클래스가 아니라 워크스페이스 hex색 자체를 쓰므로
 * 인라인 style로 투명도만 붙인다(hex는 6자리 고정이라 안전하게 알파를 이어붙일 수 있다). */
export function workspaceChipStyle(color: string): { borderColor: string; backgroundColor: string; color: string } {
  return { borderColor: `${color}70`, backgroundColor: `${color}20`, color: "#f1f5f9" };
}

export function workspaceCardEmphasis(selected: boolean, hasSelection: boolean): string {
  if (selected) return "bg-cyan-400/[0.075] opacity-100 saturate-100";
  if (hasSelection) return "bg-[var(--color-surface)] opacity-[0.82] saturate-[0.85]";
  return "bg-[var(--color-surface)] opacity-100 saturate-100";
}

export function workspaceCardShadow(color: string, selected: boolean): string {
  const identity = `inset 3px 0 0 ${color}`;
  return selected
    ? `${identity}, 0 12px 28px rgba(0,0,0,0.24)`
    : identity;
}
