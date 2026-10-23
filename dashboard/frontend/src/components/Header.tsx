import { CalendarDays, ChevronDown, CloudSun, Lightbulb, LogOut, Settings2, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { useLocalWeather } from "../hooks/useLocalWeather.js";
import { useProfile } from "../hooks/useProfile.js";
import { tipsForPath } from "../lib/pageTips.js";

export function Header() {
  const { userId, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isHome = pathname === "/home";
  const tips = tipsForPath(pathname);
  const { weather, region } = useLocalWeather(isHome);
  const { displayName } = useProfile(userId);
  const [profileOpen, setProfileOpen] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [tipPhase, setTipPhase] = useState<"idle" | "exit" | "enter">("idle");
  const [now, setNow] = useState(() => new Date());
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const date = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(now);
  const time = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(now);

  useEffect(() => setProfileOpen(false), [pathname]);
  useEffect(() => {
    if (!isHome) return;
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, [isHome]);
  useEffect(() => {
    if (isHome || tips.length < 2) return;
    const interval = window.setInterval(() => {
      setTipPhase("exit");
      window.setTimeout(() => {
        setTipIndex((current) => (current + 1) % tips.length);
        setTipPhase("enter");
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => setTipPhase("idle")));
      }, 280);
    }, 7_000);
    return () => window.clearInterval(interval);
  }, [isHome, tips.length]);
  useEffect(() => setTipIndex(0), [pathname]);
  useEffect(() => {
    if (!profileOpen) return;
    const close = (event: PointerEvent) => { if (!profileMenuRef.current?.contains(event.target as Node)) setProfileOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [profileOpen]);

  return (
    <header className="flex h-14 items-center justify-between gap-6 border-b border-white/[0.055] bg-[var(--color-surface)]/70 px-6 ck-glass">
      <div className="flex min-w-0 items-center gap-3">
        {isHome && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-400/[0.08] text-cyan-300 ring-1 ring-inset ring-cyan-300/15"><CalendarDays size={14} strokeWidth={1.9} aria-hidden="true" /></span>}
        {isHome ? <div className="flex min-w-0 items-center gap-2.5 text-[12.5px] font-semibold text-[var(--color-text)]">
          <span>{date}</span><span className="font-mono font-normal tabular-nums text-[var(--color-text-muted)]">{time}</span>
          {region ? <><span className="h-1 w-1 rounded-full bg-slate-600" /><CloudSun size={14} className="text-slate-400" aria-hidden="true" /><span className="font-normal text-[var(--color-text-muted)]">{region.label} {weather ? `${weather.temperature}° · ${weather.label}` : "날씨 확인 중…"}</span></> : <button type="button" onClick={() => navigate("/preferences?tab=weather")} className="font-normal text-cyan-300 hover:text-cyan-100">날씨 지역 설정</button>}
        </div> : <div className="flex min-w-0 items-center gap-3 overflow-hidden" aria-live="polite" aria-label="Sugo 활용 팁"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400/[0.08] text-amber-300 ring-1 ring-inset ring-amber-300/15"><Lightbulb size={15} strokeWidth={1.9} aria-hidden="true" /></span><span className={`truncate text-[14px] font-medium text-[var(--color-text)] motion-reduce:transform-none motion-reduce:transition-none ${tipPhase === "enter" ? "translate-y-2 opacity-0" : tipPhase === "exit" ? "-translate-y-2 opacity-0 transition-all duration-300" : "translate-y-0 opacity-100 transition-all duration-300"}`}>{tips[tipIndex]}</span></div>}
      </div>
      <div className="flex items-center gap-2">
        <div ref={profileMenuRef} className="relative ml-1">
          <button type="button" aria-label="프로필 메뉴" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)} className="flex h-8 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.035] px-2 text-slate-300 hover:bg-white/[0.07] hover:text-white">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-cyan-400/10 text-[9px] font-bold text-cyan-200">{displayName.slice(0, 2).toUpperCase()}</span>
            <ChevronDown size={13} className="text-slate-500" />
          </button>
          {profileOpen && <div className="absolute right-0 top-10 z-50 w-52 overflow-hidden rounded-xl border border-white/[0.10] bg-[var(--color-surface)] p-1.5 shadow-2xl">
            <div className="border-b border-white/[0.07] px-3 py-2.5"><div className="flex items-center gap-2 text-sm font-semibold text-slate-100"><UserRound size={14} className="text-cyan-300" />{displayName}</div><div className="mt-1 text-[10px] text-slate-500">{userId} · 로컬 Sugo 사용자</div></div>
            <button type="button" onClick={() => { setProfileOpen(false); navigate("/preferences"); }} className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/[0.05] hover:text-white"><Settings2 size={14} />시스템 설정</button>
            <button type="button" onClick={() => { logout(); navigate("/login"); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-slate-400 hover:bg-rose-500/10 hover:text-rose-300"><LogOut size={14} />로그아웃</button>
          </div>}
        </div>
      </div>
    </header>
  );
}
