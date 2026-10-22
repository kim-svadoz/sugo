import { CalendarDays, ChevronDown, CloudSun, Lightbulb, LogOut, Settings2, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.js";
import { useDashboardMeta } from "../hooks/useDashboardMeta.js";
import { useLocalWeather } from "../hooks/useLocalWeather.js";
import { useProfile } from "../hooks/useProfile.js";

const SUGO_TIPS = [
  "Schedule은 D-2부터 종료되지 않은 개발 항목을 Home의 ‘마감 전 확인’에 올립니다.",
  "검토 화면에서 수정 요청을 남기면 확정하지 않은 채 같은 Patch로 대화를 이어갈 수 있습니다.",
  "리뷰 보고서와 마지막 Patch의 변경 파일을 함께 보면 결과와 구현 근거를 빠르게 대조할 수 있습니다.",
  "파이프라인 완료와 개발 항목의 종료는 다릅니다. 배포와 운영 확인 뒤 직접 작업을 종료하세요.",
  "Harness에서 기술과 버전을 선택하면 프로젝트에 적용될 실제 규칙 원문을 미리 볼 수 있습니다.",
  "Workspace의 도메인 규칙은 프로젝트 .claude/rules와 동기화되어 다음 AI 작업의 기준이 됩니다.",
  "Integrations의 직접 조회 안전장치는 외부 시스템을 읽을 때 허용 범위와 비용을 함께 제한합니다.",
  "Weekly 리포트는 완료 목록보다 작업 결과와 새로 축적된 지식을 다시 찾는 데 유용합니다.",
  "Home의 ‘결정 대기’는 AI가 멈춘 작업이 아니라 사람의 판단이 있어야 안전하게 진행되는 작업입니다.",
  "프로필의 Preferences에서 표시 이름과 날씨 생활권을 설정하면 이 브라우저에 바로 적용됩니다.",
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
    if (isHome) return;
    const interval = window.setInterval(() => {
      setTipPhase("exit");
      window.setTimeout(() => {
        setTipIndex((current) => (current + 1) % SUGO_TIPS.length);
        setTipPhase("enter");
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => setTipPhase("idle")));
      }, 280);
    }, 7_000);
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
        {isHome && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-400/[0.08] text-cyan-300 ring-1 ring-inset ring-cyan-300/15"><CalendarDays size={14} strokeWidth={1.9} aria-hidden="true" /></span>}
        {isHome ? <div className="flex min-w-0 items-center gap-2.5 text-[12.5px] font-semibold text-[var(--color-text)]">
          <span>{date}</span><span className="font-mono font-normal tabular-nums text-[var(--color-text-muted)]">{time}</span>
          {region ? <><span className="h-1 w-1 rounded-full bg-slate-600" /><CloudSun size={14} className="text-slate-400" aria-hidden="true" /><span className="font-normal text-[var(--color-text-muted)]">{region.label} {weather ? `${weather.temperature}° · ${weather.label}` : "날씨 확인 중…"}</span></> : <button type="button" onClick={() => navigate("/preferences?tab=weather")} className="font-normal text-cyan-300 hover:text-cyan-100">날씨 지역 설정</button>}
        </div> : <div className="flex min-w-0 items-center gap-3 overflow-hidden" aria-live="polite" aria-label="Sugo 활용 팁"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400/[0.08] text-amber-300 ring-1 ring-inset ring-amber-300/15"><Lightbulb size={15} strokeWidth={1.9} aria-hidden="true" /></span><span className={`truncate text-[13.5px] font-medium text-[var(--color-text)] motion-reduce:transform-none motion-reduce:transition-none ${tipPhase === "enter" ? "translate-y-2 opacity-0" : tipPhase === "exit" ? "-translate-y-2 opacity-0 transition-all duration-300" : "translate-y-0 opacity-100 transition-all duration-300"}`}>{SUGO_TIPS[tipIndex]}</span></div>}
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
