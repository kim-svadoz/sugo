import { AlertCircle, ArrowRight, Clock3, Eye, Newspaper, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getNewsFeed, type NewsFeed } from "../api/newsApi.js";
import { useAuth } from "../auth/AuthContext.js";
import { useSchedule } from "../hooks/useSchedule.js";
import { useProfile } from "../hooks/useProfile.js";
import { buildHomeAttention } from "../lib/homePresentation.js";
import { cn } from "../lib/utils.js";

function relativeTime(value: string): string {
  const hours = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 3_600_000));
  if (hours < 1) return "방금 전";
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function collectedAt(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function Home() {
  const { userId } = useAuth();
  const { displayName } = useProfile(userId);
  const { data: specs, loading } = useSchedule();
  const navigate = useNavigate();
  const [newsFeed, setNewsFeed] = useState<NewsFeed | null>(null);
  const attention = useMemo(() => buildHomeAttention(specs ?? []), [specs]);

  useEffect(() => {
    let cancelled = false;
    getNewsFeed("ko").then((feed) => { if (!cancelled) setNewsFeed(feed); }).catch(() => { if (!cancelled) setNewsFeed({ items: [], fetchedAt: new Date().toISOString(), sourceCount: 0 }); });
    return () => { cancelled = true; };
  }, []);

  return <div className="mx-auto flex h-full w-full max-w-[1680px] flex-col gap-6">
    <section className="shrink-0 pt-1">
      <div className="font-mono text-xs font-semibold tracking-[0.18em] text-cyan-300">ENGINEERING BRIEF</div>
      <h1 className="mt-2 text-[32px] font-semibold tracking-[-0.03em] text-[var(--color-text-bright)]">좋은 아침입니다, {displayName}님.</h1>
      <p className="mt-2 text-[15px] text-[var(--color-text-muted)]">{loading ? "개발 흐름을 확인하고 있습니다." : attention.length > 0 ? `확인하거나 결정해야 할 항목이 ${attention.length}개 있습니다.` : "지금 직접 확인해야 할 작업이 없습니다."}</p>
    </section>

    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)]">
      <section className="min-h-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex h-[68px] items-center justify-between border-b border-[var(--color-border)] px-5">
          <div><div className="font-mono text-[11px] font-semibold tracking-[0.15em] text-cyan-300">YOUR ACTION</div><h2 className="mt-1 text-xl font-semibold text-[var(--color-text-bright)]">Attention</h2></div>
          <button type="button" onClick={() => navigate("/schedule")} className="flex items-center gap-1 text-xs font-medium text-cyan-300 hover:text-cyan-100">전체 확인 <ArrowRight size={13} /></button>
        </div>
        {attention.length > 0 ? <div>
          {attention.map((item) => <article key={`${item.workspace}:${item.id}`} className="grid min-h-[108px] grid-cols-[38px_minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--color-border)] px-5 last:border-b-0">
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", item.tone === "review" ? "bg-violet-400/10 text-violet-300" : "bg-amber-400/10 text-amber-300")}>{item.tone === "review" ? <Eye size={16} /> : <Clock3 size={16} />}</span>
            <div className="min-w-0"><div className="flex items-center gap-2"><span className={cn("font-mono text-[9px] font-semibold", item.tone === "review" ? "text-violet-300" : "text-amber-300")}>{item.label}</span><span className="truncate text-[10px] text-[var(--color-text-dim)]">{item.workspace}</span></div><h3 className="mt-1 truncate text-sm font-semibold text-slate-100">{item.title}</h3><p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">{item.detail}</p></div>
            <button type="button" onClick={() => navigate(`/schedule?reviewWorkspace=${encodeURIComponent(item.workspace)}&reviewSpec=${encodeURIComponent(item.id)}`)} className="flex items-center gap-1 whitespace-nowrap px-2 py-2 text-xs font-medium text-cyan-300 hover:text-cyan-100">{item.actionLabel}<ArrowRight size={13} /></button>
          </article>)}
        </div> : <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center"><ShieldCheck size={28} className="text-emerald-300" /><h3 className="mt-4 text-sm font-semibold text-slate-100">확인이 필요한 작업이 없습니다</h3><p className="mt-1 text-xs text-[var(--color-text-muted)]">모든 Pipeline이 정상적으로 진행되고 있습니다.</p></div>}
      </section>

      <section className="min-h-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex h-[76px] items-center justify-between border-b border-[var(--color-border)] px-6"><div><div className="font-mono text-[11px] font-semibold tracking-[0.15em] text-cyan-300">DAILY FEED</div><h2 className="mt-1 text-xl font-semibold text-[var(--color-text-bright)]">AI 뉴스</h2></div><span className="flex items-center gap-2 text-right text-xs font-medium leading-5 text-slate-400"><Newspaper size={15} className="shrink-0 text-slate-500" />{newsFeed ? `${collectedAt(newsFeed.fetchedAt)} 기준 · ${newsFeed.sourceCount}개 소스` : "최신 소식 수집 중"}</span></div>
        {newsFeed === null ? <div className="space-y-4 p-5">{[1,2,3].map((key) => <div key={key} className="h-16 animate-pulse rounded-lg bg-white/[0.035]" />)}</div> : newsFeed.items.length > 0 ? <div className="px-5">{newsFeed.items.slice(0, 5).map((item) => <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="block border-b border-[var(--color-border)] py-4 last:border-b-0"><div className="font-mono text-[11px] font-semibold tracking-[0.06em] text-cyan-300">{item.source}</div><h3 className="mt-1.5 line-clamp-2 text-[13px] font-semibold leading-5 text-slate-100 hover:text-cyan-200">{item.title}</h3><p className="mt-1.5 text-[10px] text-[var(--color-text-dim)]">{relativeTime(item.publishedAt)} · {item.category}{item.language === "en" ? " · 영문 원문" : ""}</p></a>)}</div> : <div className="flex min-h-[260px] flex-col items-center justify-center px-6 text-center"><AlertCircle size={24} className="text-slate-500" /><p className="mt-3 text-xs text-[var(--color-text-muted)]">뉴스를 불러오지 못했습니다.</p></div>}
      </section>
    </div>
  </div>;
}
