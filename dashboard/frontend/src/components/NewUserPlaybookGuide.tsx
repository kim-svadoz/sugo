import { ArrowLeft, ArrowRight, CircleAlert, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isTourHiddenToday, localDayKey, TOUR_HIDDEN_ON_KEY } from "../lib/onboardingTourVisibility.js";
import { clampTourTargetRect, positionTourCard, rectInZoomedSpace, viewportInZoomedSpace, type TourRect, type TourViewport } from "../lib/onboardingTourGeometry.js";

interface TourTarget {
  key: "home" | "playbook" | "pipeline" | "preferences" | "workspaces";
  label: string;
  title: string;
  description: string;
  selector: string;
  gap?: number;
}

const TOUR_TARGETS: TourTarget[] = [
  { key: "home", label: "HOME", title: "오늘 확인할 일을 먼저 모아봅니다", description: "진행 중인 작업, 내 확인이 필요한 일, 최근 완료 결과가 Home에 모입니다.", selector: '[data-onboarding-tour-target="home"]' },
  { key: "playbook", label: "PLAYBOOK", title: "처음 한 번은 작업 순서를 따라가세요", description: "Playbook은 프로젝트 등록부터 첫 완료까지 필요한 행동을 순서대로 보여주는 실행 가이드입니다.", selector: '[data-onboarding-tour-target="playbook"]' },
  { key: "pipeline", label: "PIPELINE", title: "AI 작업은 단계와 근거로 확인합니다", description: "구현, 테스트, 검토, 사용자 확인이 같은 흐름에 연결되고 현재 위치와 다음 행동이 표시됩니다.", selector: '[data-onboarding-tour-target="pipeline"] [data-tour-pipeline-stages]' },
  { key: "preferences", label: "PREFERENCES", title: "내 환경은 Preferences에서 맞춥니다", description: "표시 이름, 날씨 생활권, 주간 리포트 일정을 정하면 Home 인사말과 날씨, 주간 정리가 내 환경에 맞춰집니다. 정하지 않아도 Sugo를 쓰는 데는 문제가 없습니다.", selector: '[data-onboarding-tour-target="preferences"]' },
  { key: "workspaces", label: "WORKSPACES", title: "프로젝트와 운영 상태는 도메인별로 이어집니다", description: "Workspaces에서 프로젝트의 작업 이력과 배포 상태를 확인합니다. 이제 첫 프로젝트를 등록해보세요.", selector: '[data-onboarding-tour-target="workspaces"]' },
];

function pageZoom(): number {
  return Number.parseFloat(getComputedStyle(document.body).zoom) || 1;
}

function tourViewport(): TourViewport {
  return viewportInZoomedSpace({ width: window.innerWidth, height: window.innerHeight }, pageZoom());
}

function readRect(selector: string, gap?: number): TourRect | null {
  const target = document.querySelector<HTMLElement>(selector);
  if (!target) return null;
  const { top, left, right, bottom } = target.getBoundingClientRect();
  return clampTourTargetRect(rectInZoomedSpace({ top, left, right, bottom }, pageZoom()), tourViewport(), gap);
}

function centerTargetVertically(target: HTMLElement): HTMLElement | null {
  const main = document.querySelector<HTMLElement>("main");
  if (!main || !main.contains(target)) return null;
  const targetRect = target.getBoundingClientRect();
  const mainRect = main.getBoundingClientRect();
  const zoom = pageZoom();
  const top = main.scrollTop + (targetRect.top - mainRect.top) / zoom - (main.clientHeight - targetRect.height / zoom) / 2;
  main.scrollTo({ top: Math.max(0, top), behavior: "auto" });
  return main;
}

export function NewUserPlaybookGuide({ visible, onDismiss }: { visible: boolean; onDismiss: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [rect, setRect] = useState<TourRect | null>(null);
  const [hiddenOn, setHiddenOn] = useState(() => typeof window !== "undefined" ? window.localStorage.getItem(TOUR_HIDDEN_ON_KEY) : null);
  // X는 지금 열린 화면에서만 닫는다. 새로 열면 다시 보인다.
  const [closed, setClosed] = useState(false);
  const active = visible && !closed && !isTourHiddenToday(hiddenOn, new Date());
  const target = TOUR_TARGETS[step];

  useEffect(() => {
    if (!active) { setRect(null); return; }
    const update = () => setRect(readRect(target.selector, target.gap));
    const targetElement = document.querySelector<HTMLElement>(target.selector);
    const main = targetElement ? centerTargetVertically(targetElement) : null;
    const timer = window.setTimeout(update, 50);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);
    window.addEventListener("resize", update);
    main?.addEventListener("scroll", update);
    return () => { window.clearTimeout(timer); observer.disconnect(); window.removeEventListener("resize", update); main?.removeEventListener("scroll", update); };
  }, [active, target.gap, target.selector]);

  const cardRef = useRef<HTMLElement>(null);
  const [cardHeight, setCardHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const height = cardRef.current?.scrollHeight;
    if (height && height !== cardHeight) setCardHeight(height);
  }, [cardHeight, rect, step]);

  const masks = useMemo(() => rect ? [
    { top: 0, left: 0, right: 0, height: rect.top },
    { top: rect.top, left: 0, width: rect.left, height: rect.height },
    { top: rect.top, left: rect.right, right: 0, height: rect.height },
    { top: rect.bottom, left: 0, right: 0, bottom: 0 },
  ] : [], [rect]);
  const close = () => { setClosed(true); onDismiss(); };
  const hideToday = () => {
    const today = localDayKey(new Date());
    window.localStorage.setItem(TOUR_HIDDEN_ON_KEY, today);
    setHiddenOn(today);
    onDismiss();
  };
  const finish = () => { hideToday(); navigate("/settings?section=projects&register=1"); };

  if (!active || !rect) return null;
  return <div className="fixed inset-0 z-[150]" role="dialog" aria-modal="true" aria-label="Sugo 시작 안내">
    {masks.map((style, index) => <div key={index} className="fixed bg-[#020711]/75 backdrop-blur-[1px]" style={style} />)}
    <div className="pointer-events-none fixed rounded-xl border border-cyan-200/80 shadow-[0_0_0_5px_rgba(103,232,249,.08),0_0_32px_rgba(34,211,238,.20)]" style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }} />
    <section ref={cardRef} className="fixed overflow-y-auto rounded-2xl border border-cyan-200/25 bg-[#0a1627] p-5 shadow-[0_24px_70px_rgba(0,0,0,.55)]" style={positionTourCard(rect, tourViewport(), cardHeight)}>
      <div className="flex items-start justify-between gap-4"><span className="font-mono text-[10px] font-semibold tracking-[0.16em] text-cyan-300">{String(step + 1).padStart(2, "0")} · {target.label}</span><button type="button" onClick={close} aria-label="시작 안내 닫기" className="rounded-md p-1 text-slate-500 transition hover:bg-white/[0.05] hover:text-slate-200"><X size={15} /></button></div>
      <h2 className="mt-2 text-[17px] font-semibold tracking-[-0.02em] text-white">{target.title}</h2>
      <p className="mt-2 text-[12px] leading-6 text-slate-400">{target.description}</p>
      <button type="button" onClick={hideToday} title="오늘 하루 동안 시작 안내를 숨깁니다. 내일 다시 보입니다." className="mt-3 inline-flex items-center gap-1.5 rounded-md text-[11px] font-medium text-slate-500 transition hover:text-slate-200"><CircleAlert size={13} className="text-amber-300/80" />가이드 보지 않기</button>
      <div className="mt-5 flex items-center justify-between gap-4">
        <div className="flex gap-1.5" aria-label={`${step + 1}/${TOUR_TARGETS.length} 단계`}>{TOUR_TARGETS.map((item, index) => <span key={item.key} className={`h-1 w-7 rounded-full ${index === step ? "bg-cyan-300" : "bg-slate-700"}`} />)}</div>
        <div className="flex shrink-0 items-center gap-2">{step > 0 && <button type="button" onClick={() => setStep((current) => current - 1)} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-2 text-[11px] font-medium text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"><ArrowLeft size={12} />이전</button>}{step < TOUR_TARGETS.length - 1 ? <button type="button" onClick={() => setStep((current) => current + 1)} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-cyan-100 px-3 py-2 text-[11px] font-semibold text-slate-950">다음<ArrowRight size={12} /></button> : <button type="button" onClick={finish} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-cyan-100 px-3 py-2 text-[11px] font-semibold text-slate-950">첫 프로젝트 등록<ArrowRight size={12} /></button>}</div>
      </div>
    </section>
  </div>;
}
