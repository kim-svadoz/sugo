import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";

interface Command {
  id: string;
  label: string;
  run: () => void;
}

// §5: "전역 CommandPalette(Cmd/Ctrl+K, 정적 6개 네비 명령, createPortal, API 없음)".
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const navigate = useNavigate();
  const { logout } = useAuth();

  const commands: Command[] = useMemo(
    () => [
      { id: "sessions", label: "Workspaces (Sessions)로 이동", run: () => navigate("/sessions") },
      { id: "skills", label: "Skills로 이동", run: () => navigate("/skills") },
      { id: "harness", label: "Harness로 이동", run: () => navigate("/harness") },
      { id: "playbook", label: "Playbook으로 이동", run: () => navigate("/playbook") },
      { id: "settings", label: "Settings로 이동", run: () => navigate("/settings") },
      { id: "logout", label: "로그아웃", run: logout },
    ],
    [navigate, logout]
  );

  const filtered = useMemo(
    () => commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())),
    [commands, query]
  );

  useEffect(() => {
    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (!open) return;
      if (e.key === "Escape") {
        setOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const cmd = filtered[activeIndex];
        if (cmd) {
          cmd.run();
          setOpen(false);
          setQuery("");
        }
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => window.removeEventListener("keydown", handleKeydown);
  }, [open, filtered, activeIndex]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-32"
      onClick={() => setOpen(false)}
    >
      <div
        className="ck-glass ck-scan w-full max-w-md rounded-xl p-2"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          placeholder="명령 검색... (Esc로 닫기)"
          className="w-full rounded bg-white/5 px-3 py-2 text-sm outline-none"
        />
        <ul className="mt-2 space-y-1">
          {filtered.length === 0 && <li className="px-3 py-2 text-xs opacity-50">일치하는 명령 없음</li>}
          {filtered.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  c.run();
                  setOpen(false);
                }}
                className={`w-full rounded px-3 py-2 text-left text-sm ${i === activeIndex ? "ck-glow-cyan" : "hover:bg-white/5"}`}
              >
                {c.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
}
