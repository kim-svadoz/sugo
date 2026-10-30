import { Link, NavLink } from "react-router-dom";
import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, FileText, Plug, Shapes, ShieldHalf, SlidersHorizontal, Sparkles, Wand2, Workflow, Zap } from "lucide-react";
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

export function Sidebar({ playbookGuideVisible = false }: { playbookGuideVisible?: boolean }) {
  const { dashboardVersion, pluginVersion } = useDashboardMeta();
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("sugo.sidebar.collapsed") === "true");

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("sugo.sidebar.collapsed", String(next));
      return next;
    });
  }

  return (
    <aside data-collapsed={collapsed} className={cn("relative flex w-40 shrink-0 flex-col border-r border-white/[0.055] bg-[color-mix(in_srgb,var(--color-surface)_96%,black)] px-3 py-4 transition-[width,padding] duration-200 ease-out md:w-44", collapsed && "md:w-[4.5rem] md:px-2")}>
      <button type="button" onClick={toggleCollapsed} aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"} title={collapsed ? "사이드바 펼치기" : "사이드바 접기"} className="absolute -right-3 top-7 z-20 hidden h-6 w-6 items-center justify-center rounded-full border border-white/10 bg-[var(--color-surface)] text-slate-400 shadow-lg transition hover:border-cyan-300/35 hover:text-cyan-200 md:flex">
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>
      <Link
        to="/home"
        aria-label="SUGO 홈"
        title="SUGO 홈"
        className={cn("group mb-7 flex items-center gap-3 border-b border-white/[0.065] px-1 pb-5 pt-1", collapsed && "md:justify-center md:px-0")}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-300/25 via-cyan-400/15 to-violet-400/20 text-cyan-100 ring-1 ring-inset ring-cyan-200/30 shadow-[0_8px_24px_rgba(34,211,238,0.08)] transition group-hover:ring-cyan-200/45">
          <Workflow size={19} strokeWidth={2} aria-hidden="true" />
        </span>
        <span className={cn("min-w-0", collapsed && "md:hidden")}>
          <span className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-bold tracking-[0.08em] text-[var(--color-text-bright)]">SUGO</span>
          </span>
          <span className="mt-0.5 block truncate text-[12px] font-medium tracking-[-0.01em] text-slate-300">AI 개발 워크플로우</span>
        </span>
      </Link>
      <nav className="flex w-full flex-1 flex-col gap-6">
        {SIDEBAR_GROUPS.map((group) => {
          return <section key={group.label} aria-label={group.title} className="w-full">
          <div data-sidebar-group-heading className={cn("mb-2 flex items-center gap-2 px-2", collapsed && "md:px-1")} title={group.title}>
            <span className={cn("font-mono text-[11px] font-semibold uppercase leading-5 tracking-[0.14em] text-slate-300", collapsed && "md:hidden")}>{group.label}</span>
            <span data-sidebar-group-line className="h-px min-w-0 flex-1 bg-gradient-to-r from-white/[0.2] to-transparent" aria-hidden="true" />
          </div>
          <div className="space-y-0.5">
          {group.items.map(({ to, icon: iconName, label, shortcut }) => {
            const Icon = icons[iconName];
            const guided = playbookGuideVisible && to === "/playbook";
            return (
          <NavLink
            key={to}
            to={to}
            title={`${label} · ⌘${shortcut}`}
            data-onboarding-tour-target={!playbookGuideVisible ? undefined : to === "/playbook" ? "playbook" : to === "/sessions" ? "workspaces" : to === "/preferences" ? "preferences" : undefined}
            className={({ isActive }) =>
              cn(
                "group relative flex h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-left transition-colors duration-150",
                collapsed && "md:justify-center md:px-0",
                isActive
                  ? "bg-cyan-400/[0.10] text-cyan-200"
                  : guided
                    ? "bg-violet-300/[0.08] text-violet-100 ring-1 ring-inset ring-violet-300/25 shadow-[0_0_18px_rgba(167,139,250,.12)]"
                    : "text-[var(--color-text-muted)] hover:bg-white/[0.035] hover:text-[var(--color-text)]",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-cyan-300" />}
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center", isActive && "text-cyan-300")}><Icon size={16} strokeWidth={isActive ? 2.1 : 1.7} /></span>
                <span className={cn("min-w-0 flex-1 truncate py-0.5 text-[12px] font-medium leading-5 tracking-[-0.01em]", collapsed && "md:hidden")}>{label}</span>
                {guided && <Sparkles size={12} className={cn("animate-pulse text-violet-200", collapsed && "md:absolute md:-right-0.5 md:-top-0.5")} aria-label="첫 작업 안내" />}
                <span className={cn("font-mono text-[9px] text-[var(--color-text-dim)] opacity-0 transition-opacity group-hover:opacity-100", collapsed && "md:hidden")}>{shortcut}</span>
              </>
            )}
          </NavLink>
            );
          })}
          </div>
        </section>})}
      </nav>
      <div className={cn("mt-5 space-y-1 border-t border-white/[0.055] px-2 pt-3 text-[9px] leading-4 text-slate-500", collapsed && "md:hidden")} title="현재 설치된 Sugo 구성요소 버전">
        <div className="flex items-center justify-between gap-2"><span>Sugo 대시보드</span><span className="font-mono text-slate-400">v{dashboardVersion}</span></div>
        <div className="flex items-center justify-between gap-2"><span>워크플로우 엔진</span><span className="font-mono text-slate-400">v{pluginVersion ?? "—"}</span></div>
      </div>
    </aside>
  );
}
