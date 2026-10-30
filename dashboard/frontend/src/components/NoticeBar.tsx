/** 사용자가 설정을 바꿔야 하거나 알아야 할 상태를 화면 위쪽에 한 줄로 알린다. 하네스와 Weekly처럼 그 화면의 기능에 중요한 상태만 이 모양으로 알린다. */
export function NoticeBar({ title, detail, actionLabel, onAction }: { title: string; detail?: string; actionLabel: string; onAction: () => void }) {
  return <section role="status" className="notice-bar flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.045] px-4 py-2">
    <span className="min-w-0 flex-1 text-[12px] text-slate-300"><strong className="text-amber-200">{title}</strong>{detail && <span className="ml-2 text-slate-500">{detail}</span>}</span>
    <button type="button" onClick={onAction} className="rounded-lg border border-amber-300/25 px-3 py-1 text-[11px] font-semibold text-amber-100">{actionLabel}</button>
  </section>;
}
