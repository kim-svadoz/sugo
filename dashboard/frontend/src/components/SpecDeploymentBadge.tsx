import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SpecDeployment } from "../lib/specDeployment.js";

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
  const label = deployment.environment === "UNKNOWN" ? "확인 불가" : deployment.environment + (deployment.partial ? " 일부" : "");
  return <>
    <button ref={button} type="button" aria-label={`배포 환경 ${label}`} title="실제 배포 환경 확인" onClick={e => { e.stopPropagation(); setOpen(true); }} className="nodrag nopan shrink-0 rounded border border-sky-400/35 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-bold text-sky-300 hover:bg-sky-500/20">{label}</button>
    {open && createPortal(<div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4" onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) setOpen(false); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label="SPEC 배포 환경" className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-600 bg-[#0b111b] p-5 text-sm text-slate-200 shadow-2xl">
        <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold">배포 환경 · {label}</h2><p className="mt-1 text-slate-400">{title}</p></div><button type="button" onClick={() => setOpen(false)} className="rounded border border-slate-600 px-3 py-1.5">닫기</button></div>
        <p className="mt-4 text-xs leading-relaxed text-slate-400">개발 완료와 별개로, 이 SPEC의 작업 커밋이 실제 실행 중인 서비스에 반영됐는지 보여줍니다. 일부는 작업 중 일부만 반영된 상태입니다.</p>
        {deployment.reason && <p className="mt-3 rounded bg-amber-500/10 p-3 text-amber-200">{deployment.reason}</p>}
        <h3 className="mt-5 font-semibold">작업 소스</h3>
        <div className="mt-2 space-y-2">{deployment.sources?.map(source => <div key={source.taskId} className="rounded border border-slate-700 p-3"><div className="mb-1 text-xs font-semibold">{source.patchVersion ? `최신 작업 · Patch v${source.patchVersion}` : "최신 작업"}{source.commit && source.recoveredFrom && " · 기존 기록에서 커밋 복구"}</div><div className="break-all text-xs text-slate-400">{source.taskId} · {source.project ?? "프로젝트 연결 없음"}</div><div className="mt-1 break-all font-mono text-xs">{source.commit ?? (source.state === "pending" ? "Git 커밋 대기" : "작업 당시 파일과 일치하는 커밋을 확인하지 못했습니다.")}</div></div>)}</div>
        <h3 className="mt-5 font-semibold">환경별 반영</h3>
        {!deployment.environments.length && <p className="mt-2 text-slate-400">연결된 환경의 배포 근거가 없습니다. 프로젝트의 AWS 환경 연결과 조회 기록을 확인해주세요.</p>}
        {deployment.environments.map(env => <section key={env.environment} className="mt-3 rounded border border-slate-700 p-3">
          <div className="font-bold">{env.environment.toUpperCase()} · {env.included}/{env.total} 작업 반영{env.unknown ? " · 확인되지 않은 근거 있음" : ""}</div>
          {!env.services.length && <p className="mt-2 text-xs text-amber-200">연결된 서비스를 조회하지 못했습니다.</p>}
          {env.services.map((service, i) => <div key={`${service.project}:${service.service}:${i}`} className="mt-3 border-t border-slate-700 pt-3 text-xs">
            <div>{service.account} · {service.service}</div>
            <div className="mt-1 text-slate-400">조회: {service.observedAt ? new Date(service.observedAt).toLocaleString() : "기록 없음"}</div>
            {service.reason && <p className="mt-2 text-amber-200">{service.reason}</p>}
            {[...new Set(service.images)].map(image => <div key={image} className="mt-1 break-all text-slate-400">이미지: {image}</div>)}
            {service.commits.map(commit => <div key={commit} className="mt-1 break-all font-mono">배포 커밋: {commit}</div>)}
          </div>)}
        </section>)}
      </div>
    </div>, document.body)}
  </>;
}
