import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { LiveConsole } from "./LiveConsole.js";
import { CommandPalette } from "./CommandPalette.js";

const NAV_ITEMS = [
  { to: "/sessions", label: "Workspaces" },
  { to: "/skills", label: "Skills" },
  { to: "/harness", label: "Harness" },
  { to: "/playbook", label: "Playbook" },
  { to: "/settings", label: "Settings" },
];

// §5: 슬림 아이콘 Sidebar + Header("SUGÒ Console") + <Outlet> + 전역 CommandPalette(Cmd/Ctrl+K).
export function Layout() {
  const { userId, logout } = useAuth();

  return (
    <div className="flex h-screen">
      <nav className="ck-glass w-48 shrink-0 p-4">
        <div className="mb-6 font-mono text-lg ck-text-glow" style={{ color: "var(--color-primary)" }}>
          SUGÒ
        </div>
        <ul className="space-y-2">
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) =>
                  `block rounded px-2 py-1 text-sm ${isActive ? "ck-glow-cyan" : "opacity-70 hover:opacity-100"}`
                }
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex flex-1 flex-col">
        <header className="ck-glass flex items-center justify-between px-4 py-3">
          <span className="font-mono text-sm">SUGÒ Console</span>
          <div className="flex items-center gap-3 text-xs opacity-70">
            <span>{userId}</span>
            <button type="button" onClick={logout} className="hover:opacity-100">
              Logout
            </button>
          </div>
        </header>
        <main className="ck-scroll flex-1 space-y-4 p-6">
          <Outlet />
          <LiveConsole />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
