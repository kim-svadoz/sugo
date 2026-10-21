import { CalendarDays, ChevronDown, CloudSun, Lightbulb, LogOut, Settings2, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { useDashboardMeta } from "../hooks/useDashboardMeta.js";
import { useLocalWeather } from "../hooks/useLocalWeather.js";
import { useProfile } from "../hooks/useProfile.js";

const SUGO_TIPS = [
  "계획부터 운영까지, AI와 함께하는 개발 업무를 한곳에서 이어갑니다.",
  "Schedule에서 마감이 가까운 SPEC과 사람의 판단이 필요한 작업을 먼저 확인하세요.",
  "Workspace에서 도메인별 개발 흐름과 실제 배포 상태를 함께 추적할 수 있습니다.",
  "검토가 필요하면 승인하거나 수정 요청을 남겨 같은 작업 흐름을 이어가세요.",
  "Harness 규칙은 기술과 버전에 맞는 검증 기준을 프로젝트에 일관되게 적용합니다.",
  "Skills에서는 AI가 작업 중 사용하는 규칙과 역할을 미리 확인할 수 있습니다.",
  "Weekly에서 한 주의 작업 결과와 새로 얻은 기술 지식을 다시 살펴보세요.",
  "작업 결과의 테스트·변경 파일·배포 근거를 확인한 뒤 SPEC을 종료하세요.",
] as const;

/**
 * Header — h-16 ck-glass. **버전 뱃지 2축이 핵심**이다:
 * - `Console v{dashboardVersion}` — 빌드타임에 박힌 대시보드 자신의 버전(회색 보더 + cyan).
 * - `Plugin v{pluginVersion}` — 마지막 sync에서 받은 플러그인 버전(emerald + 펄스닷).
 *   아직 sync된 적이 없으면 `—`. 버전을 지어내지 않는다 — "모른다"가 정확한 정보다.
 *
 * 두 축을 나란히 두는 이유: 문제가 생겼을 때 "웹이 낡은 건지 플러그인이 낡은 건지"가
 * 첫 번째 분기점인데, 하나만 보이면 그 판단을 못 한다.
 */
export function Header() {
  const { dashboardVersion, pluginVersion } = useDashboardMeta();
  const { userId, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isHome = pathname === "/home";
  const { weather, region } = useLocalWeather(isHome);
  const { displayName } = useProfile(userId);
  const [profileOpen, setProfileOpen] = useState(false);
  const [tipIndex, setTipIndex] = useState(0);
  const [tipPhase, setTipPhase] = useState<"idle" | "exit" | "enter">("idle");
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const date = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", weekday: "long" }).format(new Date());

  useEffect(() => setProfileOpen(false), [pathname]);
  useEffect(() => {
    if (isHome) return;
    const interval = window.setInterval(() => {
      setTipPhase("exit");
      window.setTimeout(() => {
        setTipIndex((current) => (current + 1) % SUGO_TIPS.length);
        setTipPhase("enter");
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => setTipPhase("idle")));
      }, 280);
    }, 5_000);
    return () => window.clearInterval(interval);
  }, [isHome]);
  useEffect(() => {
    if (!profileOpen) return;
    const close = (event: PointerEvent) => { if (!profileMenuRef.current?.contains(event.target as Node)) setProfileOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [profileOpen]);

  return (
    <header className="flex h-14 items-center justify-between gap-6 border-b border-white/[0.055] bg-[var(--color-surface)]/70 px-6 ck-glass">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-400/[0.08] text-cyan-300 ring-1 ring-inset ring-cyan-300/15">
          {isHome ? <CalendarDays size={14} strokeWidth={1.9} aria-hidden="true" /> : <Lightbulb size={14} strokeWidth={1.9} aria-hidden="true" />}
        </span>
        {isHome ? <div className="flex min-w-0 items-center gap-2.5 text-[12.5px] font-semibold text-[var(--color-text)]">
          <span>{date}</span>
          {region ? <><span className="h-1 w-1 rounded-full bg-slate-600" /><CloudSun size={14} className="text-slate-400" aria-hidden="true" /><span className="font-normal text-[var(--color-text-muted)]">{region.label} {weather ? `${weather.temperature}° · ${weather.label}` : "날씨 확인 중…"}</span></> : <button type="button" onClick={() => navigate("/preferences?tab=weather")} className="font-normal text-cyan-300 hover:text-cyan-100">날씨 지역 설정</button>}
        </div> : <div className="flex min-w-0 items-center gap-2 overflow-hidden" aria-live="polite" aria-label="Sugo 활용 팁"><span className="shrink-0 font-mono text-[10px] font-bold tracking-[0.12em] text-cyan-300">TIP</span><span className={`truncate text-[12.5px] font-medium text-[var(--color-text)] motion-reduce:transform-none motion-reduce:transition-none ${tipPhase === "enter" ? "translate-y-2 opacity-0" : tipPhase === "exit" ? "-translate-y-2 opacity-0 transition-all duration-300" : "translate-y-0 opacity-100 transition-all duration-300"}`}>{SUGO_TIPS[tipIndex]}</span></div>}
      </div>
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 font-mono text-[11.5px] text-slate-300"
          title="Sugo 웹 대시보드 콘솔 버전"
        >
          <span className="text-slate-500">Console</span>
          <span className="text-cyan-300">v{dashboardVersion}</span>
        </span>
        <span
          className="inline-flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 font-mono text-[11.5px] text-emerald-300"
          title="내가 설치한 Sugo 플러그인 버전 (마지막 sync 시점)"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 ck-pulse-dot" />
          <span className="text-emerald-400/70">Plugin</span>
          <span className="text-emerald-200">{pluginVersion ? `v${pluginVersion}` : "—"}</span>
        </span>
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
