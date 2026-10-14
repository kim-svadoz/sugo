export const AGENT_COLOR_HEX: Record<string, string> = {
  MAIN: "#00b4d8",
  CODE: "#8b5cf6",
  TEST: "#10b981",
  REVIEW: "#f59e0b",
  DOCS: "#38bdf8",
};

export const AGENT_TONES: Record<string, { icon: string; ring: string; chip: string; bar: string }> = {
  code: {
    icon: "text-[var(--color-identity-code)]",
    ring: "ring-[var(--color-identity-code)]/50",
    chip: "border-[var(--color-identity-code)]/30 bg-[var(--color-identity-code)]/10",
    bar: "bg-[var(--color-identity-code)]",
  },
  test: {
    icon: "text-[var(--color-identity-test)]",
    ring: "ring-[var(--color-identity-test)]/50",
    chip: "border-[var(--color-identity-test)]/30 bg-[var(--color-identity-test)]/10",
    bar: "bg-[var(--color-identity-test)]",
  },
  docs: {
    icon: "text-[var(--color-identity-docs)]",
    ring: "ring-[var(--color-identity-docs)]/50",
    chip: "border-[var(--color-identity-docs)]/30 bg-[var(--color-identity-docs)]/10",
    bar: "bg-[var(--color-identity-docs)]",
  },
  review: {
    icon: "text-[var(--color-identity-review)]",
    ring: "ring-[var(--color-identity-review)]/50",
    chip: "border-[var(--color-identity-review)]/30 bg-[var(--color-identity-review)]/10",
    bar: "bg-[var(--color-identity-review)]",
  },
  sugo: {
    icon: "text-[var(--color-identity-sugo)]",
    ring: "ring-[var(--color-identity-sugo)]/50",
    chip: "border-[var(--color-identity-sugo)]/30 bg-[var(--color-identity-sugo)]/10",
    bar: "bg-[var(--color-identity-sugo)]",
  },
};

export const FALLBACK_AGENT_TONE = {
  icon: "text-slate-300",
  ring: "ring-slate-500/50",
  chip: "border-slate-500/30 bg-slate-500/15",
  bar: "bg-slate-400",
};
