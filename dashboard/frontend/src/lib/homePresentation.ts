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

export interface HomeBrief {
  decisions: HomeAttentionItem[];
  deadlines: HomeAttentionItem[];
  resume: HomeAttentionItem[];
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
      actionLabel: "작업 보기",
      tone: "due",
      priority: remaining < 0 ? 2 : 3 + remaining,
    }];
  });
  return items.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title)).slice(0, 4);
}

export function buildHomeBrief(specs: ScheduledSpec[], now = new Date()): HomeBrief {
  const attention = buildHomeAttention(specs, now);
  const decisions = attention.filter((item) => item.tone === "review");
  const deadlines = attention.filter((item) => item.tone === "due");
  const occupied = new Set(attention.map((item) => `${item.workspace}:${item.id}`));
  const resume = specs
    .filter((spec) => !occupied.has(`${spec.workspace_name}:${spec.id}`))
    .filter((spec) => (spec.active_task_count ?? 0) > 0 || spec.focus_task_status === "in_progress")
    .sort((a, b) => Date.parse(b.focus_task_updated_at ?? "") - Date.parse(a.focus_task_updated_at ?? ""))
    .slice(0, 2)
    .map<HomeAttentionItem>((spec) => ({
      id: spec.id,
      workspace: spec.workspace_name,
      title: spec.title,
      label: "진행 중",
      detail: spec.focus_task_title ? `현재 작업 · ${spec.focus_task_title}` : "진행 중인 작업 흐름이 있습니다.",
      actionLabel: "이어서 보기",
      tone: "review",
      priority: 10,
    }));
  return { decisions, deadlines, resume };
}
