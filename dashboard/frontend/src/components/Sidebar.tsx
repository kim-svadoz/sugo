import { Link, NavLink } from "react-router-dom";
import { CalendarDays, FileText, Plug, Shapes, ShieldHalf, SlidersHorizontal, Wand2, Workflow, Zap } from "lucide-react";
import { cn } from "../lib/utils.js";
import { SIDEBAR_GROUPS } from "../lib/sidebarNavigation.js";
import { useDashboardMeta } from "../hooks/useDashboardMeta.js";

/**
 * Sidebar — 슬림 아이콘 LNB(w-16 md:w-20).
 *
 * **navItems 순서 엄수**: Workspaces·Schedule·Skills·Harness·Playbook·Weekly·Settings.
 * Workspaces만 라우트가 `/sessions`이고 나머지는 라벨 소문자와 일치한다.
 */
const icons = { workspaces: Shapes, schedule: CalendarDays, weekly: FileText, skills: Zap, playbook: Wand2, harness: ShieldHalf, integrations: Plug, preferences: SlidersHorizontal } as const;

export function Sidebar() {
  const { dashboardVersion, pluginVersion } = useDashboardMeta();
  return (
    <aside className="flex w-40 shrink-0 flex-col border-r border-white/[0.055] bg-[color-mix(in_srgb,var(--color-surface)_96%,black)] px-3 py-4 md:w-44">
      <Link
        to="/home"
        aria-label="SUGO 홈"
        title="SUGO 홈"
        className="group mb-7 flex items-center gap-3 border-b border-white/[0.065] px-1 pb-5 pt-1"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-300/25 via-cyan-400/15 to-violet-400/20 text-cyan-100 ring-1 ring-inset ring-cyan-200/30 shadow-[0_8px_24px_rgba(34,211,238,0.08)] transition group-hover:ring-cyan-200/45">
          <Workflow size={19} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-bold tracking-[0.08em] text-[var(--color-text-bright)]">SUGO</span>
          </span>
          <span className="mt-0.5 block truncate text-[12px] font-medium tracking-[-0.01em] text-slate-300">AI 개발 워크플로우</span>
        </span>
      </Link>
      <nav className="flex w-full flex-1 flex-col gap-6">
        {SIDEBAR_GROUPS.map((group) => {
          return <section key={group.label} aria-label={group.title} className="w-full">
          <div data-sidebar-group-heading className="mb-2 flex items-center gap-2 px-2" title={group.title}>
            <span className="font-mono text-[11px] font-semibold uppercase leading-5 tracking-[0.14em] text-slate-300">{group.label}</span>
            <span data-sidebar-group-line className="h-px min-w-0 flex-1 bg-gradient-to-r from-white/[0.2] to-transparent" aria-hidden="true" />
          </div>
          <div className="space-y-0.5">
          {group.items.map(({ to, icon: iconName, label, shortcut }) => {
            const Icon = icons[iconName];
            return (
          <NavLink
            key={to}
            to={to}
            title={`${label} · ⌘${shortcut}`}
            className={({ isActive }) =>
              cn(
                "group relative flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors duration-150",
                isActive
                  ? "bg-cyan-400/[0.10] text-cyan-200"
                  : "text-[var(--color-text-muted)] hover:bg-white/[0.035] hover:text-[var(--color-text)]",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-cyan-300" />}
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center", isActive && "text-cyan-300")}><Icon size={16} strokeWidth={isActive ? 2.1 : 1.7} /></span>
                <span className="min-w-0 flex-1 truncate py-0.5 text-[12px] font-medium leading-5 tracking-[-0.01em]">{label}</span>
                <span className="font-mono text-[9px] text-[var(--color-text-dim)] opacity-0 transition-opacity group-hover:opacity-100">{shortcut}</span>
              </>
            )}
          </NavLink>
            );
          })}
          </div>
        </section>})}
      </nav>
      <div className="mt-5 space-y-1 border-t border-white/[0.055] px-2 pt-3 text-[9px] leading-4 text-slate-500" title="현재 설치된 Sugo 구성요소 버전">
        <div className="flex items-center justify-between gap-2"><span>Sugo 화면</span><span className="font-mono text-slate-400">v{dashboardVersion}</span></div>
        <div className="flex items-center justify-between gap-2"><span>개발 자동화</span><span className="font-mono text-slate-400">v{pluginVersion ?? "—"}</span></div>
      </div>
    </aside>
  );
}
