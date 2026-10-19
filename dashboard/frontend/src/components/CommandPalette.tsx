import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  CalendarDays,
  CornerDownLeft,
  FileText,
  LayoutGrid,
  Puzzle,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "../lib/utils.js";

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  keywords: string;
  run: () => void;
}

/**
 * CommandPalette — portal(body) + ⌘K로 열린다(토글 자체는 Layout 소유).
 *
 * **실동작하는 명령만 넣는다.** "곧 지원" 같은 항목을 섞으면 한 번 헛되이 쓴 사용자는
 * 팔레트를 다시 안 연다. 네트워크 호출도 없다 — 전부 라우팅 아니면 reload다.
 *
 * 같은 이유로 **hint에 적는 단축키는 실제로 동작하는 것만 적는다**(⌘S/⌘P는 Layout이 처리,
 * ⌘R은 브라우저 기본 새로고침). ⌘W·⌘H는 브라우저/OS가 선점해 페이지가 가로챌 수 없으므로
 * 힌트를 달지 않는다 — 의도된 선택이다.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Cmd[] = useMemo(
    () => [
      // ⌘W/⌘H는 힌트를 뗐다 — ⌘W는 브라우저가 탭을 닫고 ⌘H는 macOS가 앱을 숨기므로
      // 페이지에서 가로챌 수 없다. 못 지킬 약속을 화면에 적어두느니 안 적는 게 낫다.
      { id: "ws", label: "Workspaces", icon: LayoutGrid, keywords: "워크스페이스 workspace", run: () => navigate("/sessions") },
      { id: "schedule", label: "Schedule", icon: CalendarDays, keywords: "일정 캘린더 스케줄 마감일 calendar due date", run: () => navigate("/schedule") },
      { id: "skills", label: "Skills", hint: "⌘ S", icon: Puzzle, keywords: "스킬 에이전트 agent code test docs review", run: () => navigate("/skills") },
      { id: "harness", label: "Harness", icon: BookOpen, keywords: "하네스 규칙 archunit rules", run: () => navigate("/harness") },
      { id: "playbook", label: "Playbook", hint: "⌘ P", icon: Sparkles, keywords: "플레이북 체험 guide", run: () => navigate("/playbook") },
      { id: "weekly", label: "Weekly", icon: FileText, keywords: "주간 보고서 weekly report 리포트", run: () => navigate("/weekly") },
      { id: "settings", label: "Settings", icon: SettingsIcon, keywords: "설정 git github gitlab bitbucket codecommit pat oidc token", run: () => navigate("/settings") },
      { id: "refresh", label: "데이터 새로고침", hint: "⌘ R", icon: RefreshCw, keywords: "refresh reload 수동 수집", run: () => window.location.reload() },
    ],
    [navigate],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return commands;
    return commands.filter((c) => `${c.label} ${c.keywords}`.toLowerCase().includes(needle));
  }, [commands, q]);

  // 열릴 때마다 초기화 + 포커스. 지난 검색어가 남아 있으면 "안 열렸다"고 오해하기 쉽다.
  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    inputRef.current?.focus();
  }, [open]);

  // 필터가 좁아지면 active가 목록 밖으로 나갈 수 있다.
  useEffect(() => {
    setActive((i) => (i >= filtered.length ? 0 : i));
  }, [filtered.length]);

  if (!open) return null;

  const exec = (c: Cmd) => {
    onClose();
    c.run();
  };

  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (filtered.length === 0 ? 0 : (i + 1) % filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (filtered.length === 0 ? 0 : (i - 1 + filtered.length) % filtered.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = filtered[active];
      if (c) exec(c);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[14vh]" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-cyan-500/40 ck-glass ck-glow-cyan"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--color-border)] px-4 py-3">
          <Search size={16} className="text-cyan-300" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="명령 검색 — 페이지 이동, 새로고침…"
            className="flex-1 bg-transparent text-[14px] text-[var(--color-text)] outline-none placeholder:text-[var(--color-text-dim)]"
          />
          <kbd className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[11px] text-[var(--color-text-dim)]">ESC</kbd>
        </div>
        <ul className="ck-scroll max-h-[46vh] overflow-auto py-1.5">
          {filtered.length === 0 && (
            <li className="px-4 py-6 text-center text-[13px] text-[var(--color-text-dim)]">일치하는 명령이 없습니다</li>
          )}
          {filtered.map((c, i) => {
            const Icon = c.icon;
            return (
              <li key={c.id}>
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => exec(c)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    i === active
                      ? "bg-cyan-500/15 text-[var(--color-text-bright)]"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]",
                  )}
                >
                  <Icon size={16} className={i === active ? "text-cyan-300" : "text-[var(--color-text-dim)]"} />
                  <span className="flex-1 text-[13.5px]">{c.label}</span>
                  {c.hint && (
                    <kbd className="rounded border border-[var(--color-border)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--color-text-dim)]">
                      {c.hint}
                    </kbd>
                  )}
                  {i === active && <CornerDownLeft size={13} className="text-cyan-300/70" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body,
  );
}
