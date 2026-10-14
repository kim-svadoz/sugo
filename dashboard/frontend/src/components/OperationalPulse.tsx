import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/utils.js";

export interface PulseItem {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: "neutral" | "cyan" | "success" | "warning" | "danger";
}

const TONES = {
  neutral: "border-slate-700/70 bg-slate-900/55 text-slate-300",
  cyan: "border-cyan-500/25 bg-cyan-500/[0.07] text-cyan-200",
  success: "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-200",
  warning: "border-amber-500/25 bg-amber-500/[0.07] text-amber-200",
  danger: "border-rose-500/25 bg-rose-500/[0.07] text-rose-200",
} as const;

export function OperationalPulse({ items, label }: { items: PulseItem[]; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={label}>
      {items.map(({ label: itemLabel, value, icon: Icon, tone = "neutral" }) => (
        <div key={itemLabel} className={cn("flex h-8 items-center gap-1.5 rounded-lg border px-2.5", TONES[tone])}>
          <Icon size={12} className="shrink-0 opacity-80" />
          <span className="text-[10px] font-medium text-slate-400">{itemLabel}</span>
          <strong className="font-mono text-[12px] font-bold text-current">{value}</strong>
        </div>
      ))}
    </div>
  );
}
