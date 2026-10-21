import type { ReactNode } from "react";

export function PageHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <header className="flex flex-wrap items-end justify-between gap-4">
    <div>
      <div className="font-mono text-[11px] font-semibold tracking-[0.18em] text-cyan-300">{eyebrow}</div>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-[var(--color-text-bright)]">{title}</h1>
      <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{description}</p>
    </div>
    {action}
  </header>;
}
