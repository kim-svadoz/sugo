import { scheduleAttention } from "./taskGuidance.js";
import type { ScheduledSpec } from "../api/roadmapMutationsApi.js";

export interface HomeAttentionItem {
  id: string;
  workspace: string;
  title: string;
  label: string;
  detail: string;
  actionLabel: string;
  tone: "review" | "due";
  priority: number;
}

function dateOnly(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function daysUntil(dueDate: string, now: Date): number {
  const [year, month, day] = dueDate.split("-").map(Number);
  return Math.round((new Date(year, month - 1, day).getTime() - dateOnly(now).getTime()) / 86_400_000);
}

export function buildHomeAttention(specs: ScheduledSpec[], now = new Date()): HomeAttentionItem[] {
  const items = specs.flatMap<HomeAttentionItem>((spec) => {
    const guidance = scheduleAttention(spec, now.getTime());
    if (["blocked", "attention", "verification"].includes(guidance.kind)) {
      return [{
        id: spec.id,
        workspace: spec.workspace_name,
        title: spec.title,
        label: guidance.label,
        detail: guidance.reason,
        actionLabel: guidance.action === "open_review_confirmation" ? "검토하기" : guidance.nextAction,
        tone: "review",
        priority: guidance.kind === "blocked" ? 0 : 1,
      }];
    }
    if (!spec.due_date) return [];
    const remaining = daysUntil(spec.due_date, now);
    if (remaining > 2) return [];
    return [{
      id: spec.id,
      workspace: spec.workspace_name,
      title: spec.title,
      label: remaining < 0 ? `D+${Math.abs(remaining)}` : remaining === 0 ? "D-DAY" : `D-${remaining}`,
      detail: `${spec.due_date} 마감 · ${guidance.nextAction}`,
      actionLabel: "SPEC 열기",
      tone: "due",
      priority: remaining < 0 ? 2 : 3 + remaining,
    }];
  });
  return items.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title)).slice(0, 4);
}
