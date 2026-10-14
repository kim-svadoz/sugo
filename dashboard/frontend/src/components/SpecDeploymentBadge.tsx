import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { deploymentInclusionLabel, type SpecDeployment } from "../lib/specDeployment.js";

export function SpecDeploymentBadge({ deployment, title }: { deployment?: SpecDeployment; title: string }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); setOpen(false); }
      if (e.key === "Tab") {
        const items = [...(dialog.current?.querySelectorAll<HTMLElement>('button, a[href], input, textarea, [tabindex="0"]') ?? [])];
        const first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("keydown", key, true); (button.current ?? previous)?.focus(); };
  }, [open]);
  if (!deployment) return null;
  const label = deployment.environment === "UNKNOWN" ? "확인 중" : deployment.environment + (deployment.partial ? " 일부" : "");
  const observed = deployment.environments.flatMap(env => env.services).map(service => Date.parse(service.observedAt ?? "")).filter(Number.isFinite);
  const checkedAt = observed.length ? new Date(Math.min(...observed)).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : null;
  return <>
    <button ref={button} type="button" aria-label={`배포 환경 ${label}`} title="배포 환경 보기" onClick={e => { e.stopPropagation(); setOpen(true); }} className="nodrag nopan shrink-0 rounded border border-[var(--color-deployment)]/40 bg-[var(--color-deployment)]/10 px-1.5 py-0.5 text-[10px] font-bold text-blue-300 hover:bg-[var(--color-deployment)]/20">{label}</button>
    {open && createPortal(<div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4" onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) setOpen(false); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label="SPEC 배포 환경" className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700 bg-[#0b111b] p-6 text-sm text-slate-200 shadow-2xl">
        <div className="flex items-center justify-between gap-4"><h2 className="font-semibold text-slate-400">배포 환경</h2><button type="button" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-800 hover:text-white">닫기</button></div>
        <p className="mt-5 text-xl font-bold leading-snug">{title}</p>
        <div className="mt-5 rounded-xl bg-sky-500/10 px-4 py-4"><p className="text-xs text-slate-400">최신 작업 반영</p><p className="mt-1 text-3xl font-bold text-sky-300">{label}</p></div>
        {!!deployment.sources?.length && <div className="mt-5 space-y-3">{deployment.sources.map(source => <div key={source.taskId}><p className="text-xs font-semibold text-slate-400">{source.patchVersion ? `최근 작업 · Patch v${source.patchVersion}` : "최근 작업"}</p><p className="mt-1 line-clamp-3 leading-relaxed text-slate-200">{source.summary || title}</p></div>)}</div>}
        <div className="mt-5 divide-y divide-slate-800">{["dev", "stg", "prd"].map(environment => {
          const env = deployment.environments.find(item => item.environment === environment);
          const status = env ? deploymentInclusionLabel(env) : "미연결";
          return <div key={environment} className="flex items-center justify-between py-3"><span className="font-semibold">{environment.toUpperCase()}</span><span className={status === "포함" ? "font-semibold text-sky-300" : status === "일부 포함" ? "text-sky-300" : "text-slate-500"}>{status}</span></div>;
        })}</div>
        <p className="mt-4 text-xs text-slate-500">{checkedAt ? `${checkedAt} 조회 기준` : "AWS 조회 기록 없음"}</p>
      </div>
    </div>, document.body)}
  </>;
}
