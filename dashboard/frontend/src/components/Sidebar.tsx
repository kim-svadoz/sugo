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
const groupTone = {
  cyan: { dot: "bg-cyan-400 shadow-[0_0_8px_#22d3ee]", label: "text-cyan-200/80", active: "border-cyan-300/55 bg-cyan-400/[0.13] text-cyan-200 shadow-[inset_0_0_18px_rgba(34,211,238,0.08),0_6px_20px_rgba(6,182,212,0.08)]" },
  violet: { dot: "bg-violet-400 shadow-[0_0_8px_#a78bfa]", label: "text-violet-200/75", active: "border-violet-300/50 bg-violet-400/[0.12] text-violet-200 shadow-[inset_0_0_18px_rgba(167,139,250,0.08),0_6px_20px_rgba(124,58,237,0.08)]" },
  amber: { dot: "bg-amber-400 shadow-[0_0_8px_#fbbf24]", label: "text-amber-200/75", active: "border-amber-300/45 bg-amber-400/[0.10] text-amber-100 shadow-[inset_0_0_18px_rgba(251,191,36,0.07),0_6px_20px_rgba(217,119,6,0.07)]" },
} as const;

export function Sidebar() {
  const { pluginVersion } = useDashboardMeta();
  const { userId, logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <aside className="flex w-32 shrink-0 flex-col items-center border-r border-[var(--color-border)] bg-[linear-gradient(180deg,var(--color-surface),color-mix(in_srgb,var(--color-surface)_92%,black))] px-2 py-4 md:w-36">
      <Link to="/sessions" title="SUGÒ · for Claude Code" className="mb-6">
        {/* 이미지 자산 없이 링·글로우를 가진 문자 마크를 쓴다. */}
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-background)] font-mono text-[15px] font-bold text-cyan-300 object-cover ring-1 ring-cyan-500/40 ck-glow-cyan md:h-11 md:w-11">
          S
        </span>
      </Link>
      <nav className="flex w-full flex-1 flex-col gap-2.5">
        {SIDEBAR_GROUPS.map((group) => {
          const tone = groupTone[group.tone];
          return <section key={group.label} aria-label={group.title} className="w-full rounded-2xl border border-white/[0.055] bg-white/[0.018] p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
          <div className="mb-1.5 flex items-center gap-1.5 px-1.5 pt-0.5" title={group.title}>
            <span className={cn("h-1.5 w-1.5 rounded-full", tone.dot)} />
            <span className={cn("font-mono text-[8px] font-bold tracking-[0.13em]", tone.label)}>{group.label}</span>
          </div>
          <div className="space-y-1">
          {group.items.map(({ to, icon: iconName, label, shortcut }) => {
            const Icon = icons[iconName];
            return (
          <NavLink
            key={to}
            to={to}
            title={`${label} · ⌘${shortcut}`}
            className={({ isActive }) =>
              cn(
                "group relative flex w-full items-center gap-2 rounded-xl border px-2 py-2.5 text-left transition-all duration-150",
                isActive
                  ? tone.active
                  : "border-transparent text-[var(--color-text-muted)] hover:border-white/[0.07] hover:bg-white/[0.035] hover:text-[var(--color-text)]",
              )
            }
          >
            {({ isActive }) => (
              <>
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-lg", isActive ? "bg-white/[0.07]" : "bg-transparent")}><Icon size={16} strokeWidth={isActive ? 2.2 : 1.8} /></span>
                <span className="min-w-0 flex-1 truncate text-[10px] font-semibold leading-none tracking-[-0.01em] md:text-[11px]">{label}</span>
              </>
            )}
          </NavLink>
            );
          })}
          </div>
        </section>})}
      </nav>
      <div className="mt-4 flex flex-col items-center gap-3">
        <button
          onClick={() => window.location.reload()}
          title="수동 새로고침"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-hover)] hover:text-cyan-300"
        >
          <RefreshCw size={16} />
        </button>
        <button
          onClick={handleLogout}
          title={`${userId} · 로그아웃`}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/15 text-[12px] font-bold text-cyan-300 ring-1 ring-cyan-500/30 transition-colors hover:bg-rose-500/15 hover:text-rose-300 hover:ring-rose-500/30"
        >
          {(userId?.slice(0, 2) ?? "?").toUpperCase()}
        </button>
        <span className="font-mono text-[9px] text-[var(--color-text-dim)]">v{pluginVersion ?? "—"}</span>
      </div>
    </aside>
  );
}
