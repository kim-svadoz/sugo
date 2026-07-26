import { type ReactElement } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { CommandPalette } from "./CommandPalette.js";
import { useDashboardMeta } from "../hooks/useDashboardMeta.js";

// 슬림 아이콘 사이드바(§5). 각 항목에 인라인 SVG 아이콘 + 활성 글로우.
type IconProps = { className?: string };
const NAV_ITEMS: { to: string; label: string; Icon: (p: IconProps) => ReactElement }[] = [
  {
    to: "/sessions",
    label: "Workspaces",
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={p.className}>
        <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" />
      </svg>
    ),
  },
  {
    to: "/skills",
    label: "Skills",
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={p.className}>
        <path d="M12 3l2.1 4.6L19 9l-3.5 3.3L16.3 17 12 14.6 7.7 17l.8-4.7L5 9l4.9-1.4z" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    to: "/harness",
    label: "Harness",
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={p.className}>
        <path d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6z" strokeLinejoin="round" /><path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
  {
    to: "/playbook",
    label: "Playbook",
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={p.className}>
        <path d="M4 5.5A1.5 1.5 0 015.5 4H11v16H5.5A1.5 1.5 0 014 18.5z" /><path d="M20 5.5A1.5 1.5 0 0018.5 4H13v16h5.5A1.5 1.5 0 0020 18.5z" />
      </svg>
    ),
  },
  {
    to: "/settings",
    label: "Settings",
    Icon: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={p.className}>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
      </svg>
    ),
  },
];

export function Layout() {
  const { userId, logout } = useAuth();
  const meta = useDashboardMeta();

  return (
    <div className="flex h-screen overflow-hidden">
      <nav className="ck-glass ck-scan flex w-52 shrink-0 flex-col p-4">
        <div className="mb-7 flex items-center gap-2">
          <span className="ck-pulse-dot h-2 w-2 rounded-full" style={{ background: "var(--color-primary)", boxShadow: "0 0 8px var(--color-primary)" }} />
          <span className="font-mono text-xl font-bold ck-text-glow" style={{ color: "var(--color-primary)" }}>
            SUGÒ
          </span>
        </div>
        <ul className="space-y-1">
          {NAV_ITEMS.map(({ to, label, Icon }) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                    isActive ? "text-white" : "text-slate-400 hover:text-slate-100 hover:bg-white/5"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full" style={{ background: "var(--color-primary)", boxShadow: "0 0 8px var(--color-primary)" }} />
                    )}
                    <Icon className={`h-4 w-4 ${isActive ? "" : "opacity-70"}`} />
                    <span className={isActive ? "font-semibold" : ""}>{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mt-auto pt-4 text-[0.62rem] font-mono text-slate-600">
          <div>dashboard v{meta.dashboardVersion ?? "…"}</div>
          {meta.pluginVersion && <div>plugin v{meta.pluginVersion}</div>}
        </div>
      </nav>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="ck-glass flex items-center justify-between px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm tracking-wide">SUGÒ Console</span>
            <span className="ck-pill" style={{ color: "var(--color-primary)", borderColor: "rgba(0,180,216,0.4)" }}>
              online
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="font-mono text-slate-400">{userId}</span>
            <button type="button" onClick={logout} className="ck-btn px-3 py-1 text-xs">
              Logout
            </button>
          </div>
        </header>
        <main className="ck-scroll flex-1 space-y-4 p-6">
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
