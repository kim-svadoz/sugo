import { AlertCircle, ArrowRight, BookOpenText, Clock3, Eye, History, Play, Plus, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { getNewsFeed, type NewsFeed } from "../api/newsApi.js";
import { useActivityStream } from "../hooks/useActivityStream.js";
import { useSchedule } from "../hooks/useSchedule.js";
import { buildHomeBrief, type HomeAttentionItem } from "../lib/homePresentation.js";
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

const GREETINGS = {
  dawn: ["조용한 시간, 흐름부터 살펴볼까요?", "이른 시작이네요. 무엇부터 이어갈까요?"],
  morning: ["좋은 아침입니다. 오늘의 흐름을 정리해볼까요?", "새로운 하루예요. 중요한 일부터 시작해볼까요?"],
  afternoon: ["좋은 오후입니다. 다음 흐름을 이어가볼까요?", "오후의 작업, 어디부터 이어갈까요?"],
  evening: ["오늘의 남은 흐름을 점검해볼까요?", "마무리하기 전, 놓친 흐름은 없을까요?"],
} as const;

function dailyGreeting(now = new Date()): string {
  const hour = now.getHours();
  const group = hour < 6 ? GREETINGS.dawn : hour < 12 ? GREETINGS.morning : hour < 18 ? GREETINGS.afternoon : GREETINGS.evening;
  return group[now.getDate() % group.length];
}

function TaskRow({ item, icon, onOpen }: { item: HomeAttentionItem; icon: ReactNode; onOpen: () => void }) {
  return <article className="grid min-h-[76px] grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 border-t border-[var(--color-border)] px-5 first:border-t-0">
    <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", item.tone === "due" ? "bg-amber-400/10 text-amber-300" : "bg-violet-400/10 text-violet-300")}>{icon}</span>
    <div className="min-w-0"><div className="flex items-center gap-2"><span className={cn("font-mono text-[9px] font-semibold", item.tone === "due" ? "text-amber-300" : "text-violet-300")}>{item.label}</span><span className="truncate text-[10px] text-[var(--color-text-dim)]">{item.workspace}</span></div><h3 className="mt-1 truncate text-[13px] font-semibold text-slate-100">{item.title}</h3><p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">{item.detail}</p></div>
    <button type="button" onClick={onOpen} className="flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-2 text-[11px] font-medium text-cyan-300 hover:bg-cyan-300/[0.06] hover:text-cyan-100">{item.actionLabel}<ArrowRight size={12} /></button>
  </article>;
}

export function Home() {
  const { data: specs, loading } = useSchedule();
  const navigate = useNavigate();
  const events = useActivityStream();
  const [newsFeed, setNewsFeed] = useState<NewsFeed | null>(null);
  const brief = useMemo(() => buildHomeBrief(specs ?? []), [specs]);
  const taskCount = brief.decisions.length + brief.deadlines.length;
  const recentEvents = useMemo(() => events.filter((event, index, all) => all.findIndex((candidate) => candidate.message === event.message) === index).slice(0, 3), [events]);
  const openSpec = (item: HomeAttentionItem) => navigate(`/schedule?reviewWorkspace=${encodeURIComponent(item.workspace)}&reviewSpec=${encodeURIComponent(item.id)}&returnTo=home`);

  useEffect(() => {
    let cancelled = false;
    getNewsFeed("ko").then((feed) => { if (!cancelled) setNewsFeed(feed); }).catch(() => { if (!cancelled) setNewsFeed({ items: [], fetchedAt: new Date().toISOString(), sourceCount: 0 }); });
    return () => { cancelled = true; };
  }, []);

  return <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5">
    <section className="flex shrink-0 items-end justify-between gap-6 pt-1">
      <div><h1 className="text-[30px] font-semibold tracking-[-0.035em] text-[var(--color-text-bright)]">{dailyGreeting()}</h1><p className="mt-2 text-[14px] text-[var(--color-text-muted)]">{loading ? "개발 흐름을 확인하고 있습니다." : taskCount > 0 ? `결정하거나 마감 전에 확인할 작업이 ${taskCount}개 있습니다.` : "지금 바로 판단해야 할 작업은 없습니다."}</p></div>
      <div className="flex items-center gap-2"><button type="button" onClick={() => navigate("/schedule")} className="flex h-9 items-center gap-2 rounded-lg border border-cyan-400/25 bg-cyan-400/[0.07] px-3 text-xs font-medium text-cyan-200 hover:bg-cyan-400/[0.12]"><Plus size={14} />일정 보기</button><button type="button" onClick={() => navigate("/sessions")} className="flex h-9 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white/[0.025] px-3 text-xs font-medium text-slate-300 hover:bg-white/[0.05]"><Play size={14} />작업 흐름 보기</button></div>
    </section>

    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(350px,1fr)]">
      <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex h-[62px] items-center justify-between border-b border-[var(--color-border)] px-5"><div><h2 className="text-lg font-semibold text-[var(--color-text-bright)]">오늘의 작업</h2><p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">판단이 필요한 일부터, 마감과 진행 중인 흐름까지</p></div><button type="button" onClick={() => navigate("/schedule")} className="flex items-center gap-1 text-[11px] font-medium text-cyan-300 hover:text-cyan-100">일정 전체 보기 <ArrowRight size={12} /></button></div>
        {taskCount === 0 && brief.resume.length === 0 ? <div className="flex min-h-[250px] flex-col items-center justify-center px-6 text-center"><ShieldCheck size={26} className="text-emerald-300" /><h3 className="mt-3 text-sm font-semibold text-slate-100">지금 확인할 작업이 없습니다</h3><p className="mt-1 text-xs text-[var(--color-text-muted)]">새 일정을 만들거나 Workspace에서 다음 흐름을 시작할 수 있습니다.</p></div> : <div>
          {brief.decisions.length > 0 && <div><div className="flex h-9 items-center gap-2 bg-violet-400/[0.025] px-5 text-[10px] font-semibold text-violet-200"><Eye size={12} />결정 대기 <span className="text-violet-300/60">{brief.decisions.length}</span></div>{brief.decisions.map((item) => <TaskRow key={`${item.workspace}:${item.id}`} item={item} icon={<Eye size={15} />} onOpen={() => openSpec(item)} />)}</div>}
          {brief.deadlines.length > 0 && <div><div className="flex h-9 items-center gap-2 border-t border-[var(--color-border)] bg-amber-400/[0.025] px-5 text-[10px] font-semibold text-amber-200"><Clock3 size={12} />마감 전 확인 <span className="text-amber-300/60">{brief.deadlines.length}</span></div>{brief.deadlines.map((item) => <TaskRow key={`${item.workspace}:${item.id}`} item={item} icon={<Clock3 size={15} />} onOpen={() => openSpec(item)} />)}</div>}
          {brief.resume.length > 0 && <div><div className="flex h-9 items-center gap-2 border-t border-[var(--color-border)] bg-cyan-400/[0.025] px-5 text-[10px] font-semibold text-cyan-200"><Play size={12} />이어서 작업 <span className="text-cyan-300/60">{brief.resume.length}</span></div>{brief.resume.map((item) => <TaskRow key={`${item.workspace}:${item.id}`} item={item} icon={<Play size={15} />} onOpen={() => openSpec(item)} />)}</div>}
        </div>}
        {recentEvents.length > 0 && <div className="border-t border-[var(--color-border)] bg-white/[0.012] px-5 py-3"><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold text-slate-400"><History size={12} />최근 흐름</div><div className="grid gap-2 md:grid-cols-3">{recentEvents.map((event) => <div key={event.id} className="min-w-0"><div className="truncate text-[11px] text-slate-300">{event.message}</div><div className="mt-1 text-[9px] text-slate-600">{event.workspace_name} · {relativeTime(event.ts)}</div></div>)}</div></div>}
      </section>

      <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex h-[62px] items-center justify-between border-b border-[var(--color-border)] px-5"><div><h2 className="text-lg font-semibold text-[var(--color-text-bright)]">Tech Brief</h2><p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">국내외 엔지니어링 팀이 직접 공유한 최신 글</p></div><span className="text-right text-[10px] leading-4 text-slate-500">{newsFeed ? `${collectedAt(newsFeed.fetchedAt)} 기준` : "업데이트 중"}<br />{newsFeed ? `${newsFeed.sourceCount}개 공식 채널` : ""}</span></div>
        {newsFeed === null ? <div className="space-y-4 p-5">{[1,2,3].map((key) => <div key={key} className="h-16 animate-pulse rounded-lg bg-white/[0.035]" />)}</div> : newsFeed.items.length > 0 ? <div className="px-5">{newsFeed.items.slice(0, 4).map((item) => <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="group block border-b border-[var(--color-border)] py-4 last:border-b-0"><div className="flex items-center justify-between gap-3"><span className="text-[11px] font-semibold text-cyan-300">{item.source}</span><span className="text-[9px] text-slate-600">{relativeTime(item.publishedAt)}</span></div><h3 className="mt-1.5 line-clamp-2 text-[13px] font-semibold leading-5 text-slate-100 group-hover:text-cyan-200">{item.title}</h3><div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-[var(--color-text-dim)]">{item.category}{item.language === "en" ? " · 영문 원문" : ""}</span><BookOpenText size={13} className="text-slate-600 transition-colors group-hover:text-cyan-300" /></div></a>)}</div> : <div className="flex min-h-[250px] flex-col items-center justify-center px-6 text-center"><AlertCircle size={24} className="text-slate-500" /><p className="mt-3 text-xs text-[var(--color-text-muted)]">기술 글을 불러오지 못했습니다.</p></div>}
      </section>
    </div>
  </div>;
}
