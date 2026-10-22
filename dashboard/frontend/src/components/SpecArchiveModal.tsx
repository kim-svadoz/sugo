import { Archive, RotateCcw, X } from "lucide-react";
import { useEffect } from "react";
import type { ScheduleSpecArchive } from "../api/scheduleSpecArchiveApi.js";
import { cn } from "../lib/utils.js";

export function SpecArchiveModal({ items, busy, onClose, onRestore }: {
  items: ScheduleSpecArchive[];
  busy: boolean;
  onClose: () => void;
  onRestore: (item: ScheduleSpecArchive) => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return <div className="fixed inset-0 z-[96] flex items-center justify-center bg-black/65 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="spec-archive-title" className="w-full max-w-2xl overflow-hidden rounded-2xl border border-white/[0.1] bg-[#0c131f] shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
      <header className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-6 py-5">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-cyan-400/10 p-2 text-cyan-300"><Archive size={18} /></span>
          <div><h2 id="spec-archive-title" className="text-[16px] font-bold text-white">종료된 작업</h2><p className="mt-1 text-[11.5px] text-slate-400">활성 화면에서 내려간 개발 항목입니다. 개발 이력은 유지되며 언제든 복구할 수 있습니다.</p></div>
        </div>
        <div className="flex items-center gap-2"><span className="rounded-full bg-white/[0.06] px-2.5 py-1 font-mono text-[10px] text-slate-300">{items.length}</span><button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white" aria-label="보관함 닫기"><X size={17} /></button></div>
      </header>
      <div className="ck-scroll max-h-[55vh] space-y-2 overflow-auto p-5">
        {items.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 py-14 text-center text-sm text-slate-500">종료된 작업이 없습니다.</div> : items.map((item) => <article key={`${item.workspace_name}:${item.spec_id}`} className="flex items-center gap-4 rounded-xl border border-white/[0.09] bg-white/[0.025] px-4 py-3">
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold", item.reason === "closed" ? "bg-amber-400/10 text-amber-200" : "bg-rose-400/10 text-rose-200")}>{item.reason === "closed" ? "종료" : "삭제"}</span><h3 className="truncate text-[13px] font-semibold text-white">{item.title}</h3></div><p className="mt-1 font-mono text-[10px] text-slate-500">{item.workspace_name} · {new Date(item.archived_at).toLocaleString("ko-KR")}</p></div>
          <button type="button" disabled={busy} onClick={() => onRestore(item)} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.07] px-3 py-2 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-40"><RotateCcw size={13} /> 복구</button>
        </article>)}
      </div>
    </section>
  </div>;
}
