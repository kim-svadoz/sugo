import { Link, NavLink, useNavigate } from "react-router-dom";
import { CalendarDays, FileText, RefreshCw, Shapes, ShieldHalf, SlidersHorizontal, Wand2, Zap } from "lucide-react";
import { cn } from "../lib/utils.js";
import { SIDEBAR_DESTINATIONS } from "../lib/sidebarNavigation.js";
import { useAuth } from "../auth/AuthContext.js";
import { useDashboardMeta } from "../hooks/useDashboardMeta.js";

/**
 * Sidebar — 슬림 아이콘 LNB(w-16 md:w-20).
 *
 * **navItems 순서 엄수**: Workspaces·Schedule·Skills·Harness·Playbook·Weekly·Settings.
 * Workspaces만 라우트가 `/sessions`이고 나머지는 라벨 소문자와 일치한다 — 홈이 원래
 * "세션 목록"이었다가 "워크스페이스"로 라벨만 바뀐 흔적이라 URL과 라벨이 어긋나 있다.
 */
const icons = [Shapes, CalendarDays, Zap, ShieldHalf, Wand2, FileText, SlidersHorizontal];
const navItems = SIDEBAR_DESTINATIONS.map((item, index) => ({ ...item, icon: icons[index] }));

export function Sidebar() {
  const { pluginVersion } = useDashboardMeta();
  const { userId, logout } = useAuth();
  const navigate = useNavigate();
  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <aside className="flex w-16 flex-col items-center border-r border-[var(--color-border)] bg-[var(--color-surface)] py-4 md:w-20">
      <Link to="/sessions" title="SUGÒ · for Claude Code" className="mb-6">
        {/* 이미지 자산 없이 링·글로우를 가진 문자 마크를 쓴다. */}
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-background)] font-mono text-[15px] font-bold text-cyan-300 object-cover ring-1 ring-cyan-500/40 ck-glow-cyan md:h-11 md:w-11">
          S
        </span>
      </Link>
      <nav className="flex w-full flex-1 flex-col items-center gap-1.5 px-1.5">
        {navItems.map(({ to, icon: Icon, label, shortcut }) => (
          <NavLink
            key={to}
            to={to}
            title={`${label} · ⌘${shortcut}`}
            className={({ isActive }) =>
              cn(
                "group relative flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 transition-all",
                isActive
                  ? "bg-gradient-to-r from-cyan-500/20 to-blue-500/10 text-cyan-400"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]",
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute -left-1.5 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-cyan-400 shadow-[0_0_10px_#00b4d8]" />
                )}
                <Icon size={19} />
                <span className="text-[9px] font-semibold leading-none tracking-tight">{label}</span>
                <span className="absolute right-1 top-1 font-mono text-[8px] text-[var(--color-text-dim)]">{shortcut}</span>
              </>
            )}
          </NavLink>
        ))}
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
