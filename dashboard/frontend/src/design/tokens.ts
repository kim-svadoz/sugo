/** Names shown by the foundations catalog. CSS in styles/tokens.css remains the value source of truth. */
export const COLOR_TOKENS = [
  { group: "Brand", names: ["--color-primary", "--color-secondary", "--color-accent"] },
  { group: "Text", names: ["--color-text-bright", "--color-text", "--color-text-muted", "--color-text-dim"] },
  { group: "Surface", names: ["--color-background", "--color-surface", "--color-surface-hover", "--surface-raised-1", "--surface-raised-2", "--color-border"] },
  { group: "Status", names: ["--color-status-success", "--color-status-progress", "--color-status-warning", "--color-status-danger", "--color-status-neutral"] },
] as const;

export const SPACING_TOKENS = ["--ds-space-1", "--ds-space-2", "--ds-space-3", "--ds-space-4", "--ds-space-5", "--ds-space-6", "--ds-space-8", "--ds-space-10", "--ds-space-12"] as const;
export const RADIUS_TOKENS = ["--ds-radius-sm", "--ds-radius-md", "--ds-radius-lg", "--ds-radius-xl", "--ds-radius-pill"] as const;
export const CONTROL_TOKENS = ["--control-height-xs", "--control-height-sm", "--control-height-md"] as const;
