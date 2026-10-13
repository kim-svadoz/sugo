import { useMemo, useState } from "react";
import { Eye, FilePenLine, Save, Trash2 } from "lucide-react";
import type { ScheduledMemo } from "../api/scheduleMemoApi.js";
import { DatePicker } from "./DatePicker.js";
import { Modal } from "./Modal.js";
import { safeMarkdown } from "../lib/safeMarkdown.js";

export interface ScheduleMemoDraft { title: string; contentMd: string; dueDate: string | null }

export function ScheduleMemoPanel({ memo, initialDate, busy, onSave, onDelete, onClose }: {
  memo?: ScheduledMemo;
  initialDate?: string | null;
  busy: boolean;
  onSave: (draft: ScheduleMemoDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(memo?.title ?? "");
  const [contentMd, setContentMd] = useState(memo?.content_md ?? "");
  const [dueDate, setDueDate] = useState<string | null>(memo?.due_date ?? initialDate ?? null);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rendered = useMemo(() => safeMarkdown(contentMd), [contentMd]);
  const changed = !memo || title !== memo.title || contentMd !== memo.content_md || dueDate !== memo.due_date;

  return <Modal onClose={onClose} size="wide">
    <div className="flex min-h-[62vh] flex-col gap-4">
      <header className="flex items-start justify-between gap-4">
        <div><div className="font-mono text-[10px] font-bold tracking-[0.14em] text-slate-400">SCHEDULE MEMO</div><h2 className="mt-1 text-lg font-bold text-[var(--color-text-bright)]">{memo ? "메모 수정" : "메모 추가"}</h2></div>
        <div className="flex rounded-lg border border-[var(--color-border)] p-0.5 text-[11px] font-semibold">
          <button onClick={() => setMode("write")} className={`flex items-center gap-1 rounded-md px-3 py-1.5 ${mode === "write" ? "bg-slate-500/20 text-slate-100" : "text-[var(--color-text-muted)]"}`}><FilePenLine size={12} /> 작성</button>
          <button onClick={() => setMode("preview")} className={`flex items-center gap-1 rounded-md px-3 py-1.5 ${mode === "preview" ? "bg-slate-500/20 text-slate-100" : "text-[var(--color-text-muted)]"}`}><Eye size={12} /> 미리보기</button>
        </div>
      </header>
      <label className="block text-[12px] text-[var(--color-text-muted)]">제목<input autoFocus value={title} maxLength={512} onChange={(event) => setTitle(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-500/30 bg-[var(--color-background)] px-3 py-2 text-[13px] text-[var(--color-text)] outline-none focus:border-slate-300/50" /></label>
      <div><span className="mb-1 block text-[12px] text-[var(--color-text-muted)]">날짜</span><DatePicker value={dueDate} onChange={setDueDate} /></div>
      <div className="min-h-0 flex-1">
        {mode === "write" ? <textarea value={contentMd} onChange={(event) => setContentMd(event.target.value)} maxLength={200000} placeholder={"Markdown 문법으로 작성하세요.\n\n## 확인할 내용\n- 항목 1\n- 항목 2"} className="ck-scroll h-full min-h-[34vh] w-full resize-none rounded-xl border border-slate-500/30 bg-[#070b12] p-4 font-mono text-[12.5px] leading-6 text-slate-200 outline-none focus:border-slate-300/50" /> : <article className="md-body ck-scroll h-full min-h-[34vh] overflow-auto rounded-xl border border-slate-500/25 bg-[var(--color-background)] p-5 text-[13px] leading-7" dangerouslySetInnerHTML={{ __html: rendered || '<p class="text-slate-500">작성된 내용이 없습니다.</p>' }} />}
      </div>
      <footer className="flex items-center justify-between border-t border-[var(--color-border)] pt-3">
        <div>{memo && (!confirmDelete ? <button disabled={busy} onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-rose-400/80 hover:bg-rose-500/10"><Trash2 size={13} /> 삭제</button> : <div className="flex items-center gap-2 text-[11px] text-rose-200"><span>이 메모를 삭제할까요?</span><button disabled={busy} onClick={() => void onDelete?.()} className="rounded border border-rose-400/40 bg-rose-500/15 px-2 py-1 font-bold">삭제</button><button onClick={() => setConfirmDelete(false)} className="rounded border border-slate-500/30 px-2 py-1">취소</button></div>)}</div>
        <button disabled={busy || !title.trim() || !changed} onClick={() => void onSave({ title: title.trim(), contentMd, dueDate })} className="flex items-center gap-1.5 rounded-lg border border-slate-400/40 bg-slate-400/15 px-4 py-2 text-[12px] font-bold text-slate-100 hover:bg-slate-400/25 disabled:cursor-not-allowed disabled:opacity-40"><Save size={13} /> {busy ? "저장 중…" : "저장"}</button>
      </footer>
    </div>
  </Modal>;
}
