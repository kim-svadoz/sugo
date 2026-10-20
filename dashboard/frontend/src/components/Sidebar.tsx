import { Link, NavLink, useNavigate } from "react-router-dom";
import { CalendarDays, FileText, RefreshCw, Shapes, ShieldHalf, SlidersHorizontal, Wand2, Zap } from "lucide-react";
import { cn } from "../lib/utils.js";
import { SIDEBAR_GROUPS } from "../lib/sidebarNavigation.js";
import { useAuth } from "../auth/AuthContext.js";
import { useDashboardMeta } from "../hooks/useDashboardMeta.js";

/**
 * Sidebar — 슬림 아이콘 LNB(w-16 md:w-20).
 *
 * **navItems 순서 엄수**: Workspaces·Schedule·Skills·Harness·Playbook·Weekly·Settings.
 * Workspaces만 라우트가 `/sessions`이고 나머지는 라벨 소문자와 일치한다.
 */
const icons = { workspaces: Shapes, schedule: CalendarDays, weekly: FileText, skills: Zap, playbook: Wand2, harness: ShieldHalf, settings: SlidersHorizontal } as const;

export function Sidebar() {
  const { pluginVersion } = useDashboardMeta();
  const { userId, logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <aside className="flex w-40 shrink-0 flex-col border-r border-white/[0.055] bg-[color-mix(in_srgb,var(--color-surface)_96%,black)] px-3 py-4 md:w-44">
      <Link
        to="/sessions"
        aria-label="SUGO 홈"
        title="SUGO 홈"
        className="group mb-8 flex h-10 items-center gap-2.5 px-2"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-400/[0.08] font-mono text-[12px] font-bold text-cyan-100 ring-1 ring-inset ring-cyan-200/20 transition group-hover:bg-cyan-400/[0.13]">
          S
        </span>
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="font-mono text-[12px] font-bold tracking-[0.12em] text-[var(--color-text)]">SUGO</span>
          <span className="font-mono text-[9px] text-cyan-300/65">Console</span>
        </span>
      </Link>
      <nav className="flex w-full flex-1 flex-col gap-6">
        {SIDEBAR_GROUPS.map((group) => {
          return <section key={group.label} aria-label={group.title} className="w-full">
          <div
            data-sidebar-group-heading
            className="mb-1.5 px-3 font-mono text-[9px] font-medium uppercase leading-5 tracking-[0.14em] text-[var(--color-text-dim)]"
            title={group.title}
          >
            {group.label}
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
      <div className="mt-4 flex items-center justify-between border-t border-white/[0.055] px-2 pt-4">
        <button
          onClick={() => window.location.reload()}
          title="수동 새로고침"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-cyan-300"
        >
          <RefreshCw size={16} />
        </button>
        <button
          onClick={handleLogout}
          title={`${userId} · 로그아웃`}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.045] text-[10px] font-bold text-[var(--color-text-muted)] ring-1 ring-white/[0.07] transition-colors hover:bg-rose-500/10 hover:text-rose-300 hover:ring-rose-500/20"
        >
          {(userId?.slice(0, 2) ?? "?").toUpperCase()}
        </button>
        <span className="font-mono text-[9px] text-[var(--color-text-dim)]">v{pluginVersion ?? "—"}</span>
      </div>
    </aside>
  );
}
