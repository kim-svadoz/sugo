import type { ReactNode } from "react";

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="page-heading">
    <div className="page-heading__eyebrow font-mono text-[11px] font-semibold tracking-[0.18em] text-cyan-300">{eyebrow}</div>
    <h1 className="page-heading__title mt-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--color-text-bright)]">{title}</h1>
    <div className="page-heading__meta mt-1 flex min-h-9 flex-wrap items-center justify-between gap-3">
      <p className="text-sm leading-6 text-[var(--color-text-muted)]">{description}</p>
      {action}
    </div>
  </header>;
}
