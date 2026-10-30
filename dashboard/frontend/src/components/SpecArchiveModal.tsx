import { Archive, FilePenLine, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ScheduleSpecArchive } from "../api/scheduleSpecArchiveApi.js";
import { cn } from "../lib/utils.js";
import type { ScheduledMemo } from "../api/scheduleMemoApi.js";
import type { ArchivePagination } from "../api/scheduleSpecArchiveApi.js";

function formatArchiveTime(value: string): string { return new Date(value).toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" }); }

function Pagination({ value, onChange }: { value: ArchivePagination; onChange?: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(value.total / value.pageSize));
  if (pages <= 1) return null;
  return <div className="flex items-center justify-center gap-3 border-t border-white/[0.08] px-5 py-3">
    <button type="button" disabled={value.page <= 1} onClick={() => onChange?.(value.page - 1)} className="rounded-md px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/[0.06] disabled:opacity-25">이전</button>
    <span className="font-mono text-[10px] text-slate-500">{value.page} / {pages}</span>
    <button type="button" disabled={!value.hasMore} onClick={() => onChange?.(value.page + 1)} className="rounded-md px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:bg-white/[0.06] disabled:opacity-25">다음</button>
  </div>;
}

export function SpecArchiveModal({ items, memos, busy, onClose, onRestore, onRestoreMemo, specPagination, memoPagination, onSpecPageChange, onMemoPageChange }: {
  items: ScheduleSpecArchive[];
  memos?: ScheduledMemo[];
  busy: boolean;
  onClose: () => void;
  onRestore: (item: ScheduleSpecArchive) => void;
  onRestoreMemo?: (memo: ScheduledMemo) => void;
  specPagination?: ArchivePagination;
  memoPagination?: ArchivePagination;
  onSpecPageChange?: (page: number) => void;
  onMemoPageChange?: (page: number) => void;
}) {
  const memoItems = memos ?? [];
  const hasMemoArchive = memos !== undefined;
  const [section, setSection] = useState<"schedule" | "memo">(() => items.length === 0 && memoItems.length > 0 ? "memo" : "schedule");
  const specTotal = specPagination?.total ?? items.length;
  const memoTotal = memoPagination?.total ?? memoItems.length;
  const total = specTotal + memoTotal;
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
          <div><h2 id="spec-archive-title" className="text-[16px] font-bold text-white">보관함</h2><p className="mt-1 text-[11.5px] text-slate-400">활성 화면에서 내려간 개발 항목과 메모를 확인하고 복구할 수 있습니다.</p></div>
        </div>
        <div className="flex items-center gap-2"><span className="rounded-full bg-white/[0.06] px-2.5 py-1 font-mono text-[10px] text-slate-300">{total}</span><button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/[0.06] hover:text-white" aria-label="보관함 닫기"><X size={17} /></button></div>
      </header>
      {hasMemoArchive && <nav className="flex gap-1 border-b border-white/[0.08] px-5 pt-3" aria-label="보관함 분류">
        <button type="button" onClick={() => setSection("schedule")} className={cn("border-b-2 px-3 py-2 text-[11px] font-semibold", section === "schedule" ? "border-cyan-300 text-cyan-200" : "border-transparent text-slate-500 hover:text-slate-300")}>개발 일정 <span className="ml-1 font-mono text-[9px]">{specTotal}</span></button>
        <button type="button" onClick={() => setSection("memo")} className={cn("border-b-2 px-3 py-2 text-[11px] font-semibold", section === "memo" ? "border-cyan-300 text-cyan-200" : "border-transparent text-slate-500 hover:text-slate-300")}>메모 <span className="ml-1 font-mono text-[9px]">{memoTotal}</span></button>
      </nav>}
      <div className="ck-scroll max-h-[55vh] space-y-2 overflow-auto p-5">
        {total === 0 && <div className="rounded-xl border border-dashed border-white/10 py-14 text-center text-sm text-slate-500">보관된 항목이 없습니다.</div>}
        {section === "schedule" && items.length === 0 && total > 0 && <div className="rounded-xl border border-dashed border-white/10 py-14 text-center text-sm text-slate-500">보관된 개발 일정이 없습니다.</div>}
        {section === "schedule" && items.map((item) => <article key={`${item.workspace_name}:${item.spec_id}`} className="flex items-center gap-4 rounded-xl border border-white/[0.09] bg-white/[0.025] px-4 py-3">
          <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className={cn("rounded px-1.5 py-0.5 text-[9px] font-bold", item.reason === "closed" ? "bg-amber-400/10 text-amber-200" : "bg-rose-400/10 text-rose-200")}>{item.reason === "closed" ? "종료" : "삭제"}</span><h3 className="truncate text-[13px] font-semibold text-white">{item.title}</h3></div><p className="mt-1 font-mono text-[10px] text-slate-500">{item.workspace_name}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500"><span>마지막 작업 <b className="ml-1 font-medium text-slate-300">{formatArchiveTime(item.last_worked_at)}</b></span><span>보관 <b className="ml-1 font-medium text-slate-300">{formatArchiveTime(item.archived_at)}</b></span></div></div>
          <button type="button" disabled={busy} onClick={() => onRestore(item)} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.07] px-3 py-2 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-40"><RotateCcw size={13} /> 복구</button>
        </article>)}
        {hasMemoArchive && section === "memo" && memoItems.length === 0 && total > 0 && <div className="rounded-xl border border-dashed border-white/10 py-14 text-center text-sm text-slate-500">보관된 메모가 없습니다.</div>}
        {section === "memo" && memoItems.map((memo) => <article key={memo.id} className="flex items-center gap-4 rounded-xl border border-slate-400/15 bg-slate-300/[0.025] px-4 py-3">
          <span className="rounded-lg bg-slate-400/10 p-2 text-slate-300"><FilePenLine size={15} /></span>
          <div className="min-w-0 flex-1"><h4 className="truncate text-[13px] font-semibold text-white">{memo.title}</h4><p className="mt-1 font-mono text-[10px] text-slate-500">{memo.due_date ? `일정 ${memo.due_date}` : "일정 없음"}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500"><span>마지막 작업 <b className="ml-1 font-medium text-slate-300">{formatArchiveTime(memo.updated_at)}</b></span>{memo.archived_at && <span>보관 <b className="ml-1 font-medium text-slate-300">{formatArchiveTime(memo.archived_at)}</b></span>}</div></div>
          <button type="button" disabled={busy} onClick={() => onRestoreMemo?.(memo)} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.07] px-3 py-2 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-40"><RotateCcw size={13} /> 복구</button>
        </article>)}
      </div>
      {section === "schedule" && specPagination && <Pagination value={specPagination} onChange={onSpecPageChange} />}
      {section === "memo" && memoPagination && <Pagination value={memoPagination} onChange={onMemoPageChange} />}
    </section>
  </div>;
}
