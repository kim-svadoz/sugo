import { ArrowRight, BookOpenText, CheckCircle2, ChevronRight, Code2, Eye, GitPullRequest, Library, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getNewsFeed, type NewsFeed, type NewsItem } from "../api/newsApi.js";
import type { ScheduledSpec } from "../api/roadmapMutationsApi.js";
import { useAuth } from "../auth/AuthContext.js";
import { useSchedule } from "../hooks/useSchedule.js";
import { buildHomeBrief } from "../lib/homePresentation.js";

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
  dawn: ["조용한 시간, 어제의 개발을 정리해볼까요?", "이른 시작이네요. 리뷰할 흐름부터 살펴볼까요?"],
  morning: ["좋은 아침입니다. 어제의 개발부터 이어볼까요?", "좋은 아침입니다. 오늘의 리뷰를 준비했습니다."],
  afternoon: ["좋은 오후입니다. 남은 리뷰를 이어볼까요?", "오후의 작업 전, 개발 흐름을 짚어볼까요?"],
  evening: ["오늘의 개발을 마무리하며 살펴볼까요?", "마무리하기 전, 남은 기술 쟁점을 확인해볼까요?"],
} as const;

function dailyGreeting(now = new Date()): string {
  const hour = now.getHours();
  const group = hour < 6 ? GREETINGS.dawn : hour < 12 ? GREETINGS.morning : hour < 18 ? GREETINGS.afternoon : GREETINGS.evening;
  return group[now.getDate() % group.length];
}

function firstSentence(value: string | null | undefined): string {
  if (!value) return "기록된 작업 요약이 없습니다.";
  return value.split(/\n|(?<=[.!?])\s+/)[0].trim();
}

function recentReview(specs: ScheduledSpec[]): { label: string; items: Array<{ spec: ScheduledSpec; history: NonNullable<ScheduledSpec["development_history"]>[number] }> } {
  const all = specs.flatMap((spec) => (spec.development_history ?? []).filter((history) => history.completed_at).map((history) => ({ spec, history })));
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  const key = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  const yesterdayItems = all.filter(({ history }) => key(new Date(history.completed_at!)) === key(yesterday));
  const selected = yesterdayItems.length > 0 ? yesterdayItems : all.sort((a, b) => Date.parse(b.history.completed_at!) - Date.parse(a.history.completed_at!)).slice(0, 2);
  return { label: yesterdayItems.length > 0 ? "어제의 작업" : "최근 작업 리뷰", items: selected.slice(0, 3) };
}

function technicalPoint(specs: ScheduledSpec[]): { title: string; body: string; workspace: string; id: string } | null {
  const candidates = specs.flatMap((spec) => {
    const result = spec.focus_task_work_result as { report?: { designDecisions?: string[]; knownLimitations?: string[] } } | null | undefined;
    const decision = result?.report?.designDecisions?.find(Boolean);
    const risk = result?.report?.knownLimitations?.find(Boolean);
    if (!decision && !risk) return [];
    return [{ title: decision ? "이번 작업에서 내린 설계 결정" : "리뷰에 남은 기술적 주의점", body: firstSentence(decision ?? risk), workspace: spec.workspace_name, id: spec.id, updatedAt: spec.focus_task_updated_at ?? "" }];
  });
  return candidates.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;
}

function TechBrief({ feed, userId }: { feed: NewsFeed | null; userId: string | null }) {
  const storageKey = `sugo-tech-brief-bookmarks:${userId ?? "local"}`;
  const [tab, setTab] = useState<"latest" | "saved">("latest");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [saved, setSaved] = useState<NewsItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "[]") as NewsItem[]; } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(saved)); }, [saved, storageKey]);
  const items = tab === "saved" ? saved : (feed?.items ?? []).slice(0, 4);
  const toggle = (item: NewsItem) => setSaved((current) => current.some((savedItem) => savedItem.url === item.url) ? current.filter((savedItem) => savedItem.url !== item.url) : [item, ...current]);

  return <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
    <div className="border-b border-[var(--color-border)] px-5 pt-4">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-[var(--color-text-bright)]">Tech Brief</h2><p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">엔지니어링 팀이 직접 공유한 최신 글</p></div><button type="button" onClick={() => setSourcesOpen(true)} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] text-slate-400 hover:bg-white/[0.04] hover:text-cyan-200"><Library size={12} />추적 채널 {feed?.sourceCount ?? 0}</button></div>
      <div className="mt-3 flex gap-5"><button type="button" onClick={() => setTab("latest")} className={`border-b-2 pb-2 text-[11px] font-semibold ${tab === "latest" ? "border-cyan-300 text-cyan-200" : "border-transparent text-slate-500"}`}>최신</button><button type="button" onClick={() => setTab("saved")} className={`border-b-2 pb-2 text-[11px] font-semibold ${tab === "saved" ? "border-cyan-300 text-cyan-200" : "border-transparent text-slate-500"}`}>즐겨찾기 {saved.length > 0 && <span className="ml-1 text-cyan-300/70">{saved.length}</span>}</button><span className="ml-auto pb-2 text-[9px] text-slate-600">{feed ? `${collectedAt(feed.fetchedAt)} 기준` : "업데이트 중"}</span></div>
    </div>
    {items.length > 0 ? <div className="px-5">{items.map((item) => <article key={item.url} className="group grid grid-cols-[minmax(0,1fr)_28px] gap-2 border-b border-[var(--color-border)] py-3.5 last:border-b-0"><a href={item.url} target="_blank" rel="noreferrer" className="min-w-0"><div className="flex items-center gap-2"><span className="text-[10px] font-semibold text-cyan-300">{item.source}</span><span className="text-[9px] text-slate-600">{relativeTime(item.publishedAt)}</span></div><h3 className="mt-1.5 line-clamp-2 text-[12.5px] font-semibold leading-5 text-slate-100 group-hover:text-cyan-200">{item.title}</h3><span className="mt-1.5 block text-[9px] text-[var(--color-text-dim)]">{item.category}{item.language === "en" ? " · 영문 원문" : ""}</span></a><button type="button" onClick={() => toggle(item)} aria-label={saved.some((savedItem) => savedItem.url === item.url) ? "즐겨찾기 해제" : "즐겨찾기 저장"} className="flex h-7 w-7 items-center justify-center rounded-md text-slate-600 hover:bg-white/[0.04] hover:text-amber-300"><Star size={14} fill={saved.some((savedItem) => savedItem.url === item.url) ? "currentColor" : "none"} className={saved.some((savedItem) => savedItem.url === item.url) ? "text-amber-300" : ""} /></button></article>)}</div> : <div className="flex min-h-44 flex-col items-center justify-center px-6 text-center"><BookOpenText size={22} className="text-slate-600" /><p className="mt-3 text-xs text-slate-400">{tab === "saved" ? "별표를 눌러 다시 읽을 글을 보관하세요." : "새 글을 불러오는 중입니다."}</p></div>}
    {sourcesOpen && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourcesOpen(false); }}><section className="max-h-[78vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[#0a111d] shadow-2xl"><header className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4"><div><h3 className="text-base font-semibold text-white">추적 중인 기술 채널</h3><p className="mt-1 text-[11px] text-slate-400">공식 기술 블로그와 엔지니어링 채널 {feed?.sourceCount ?? 0}곳</p></div><button type="button" onClick={() => setSourcesOpen(false)} className="rounded-md p-2 text-slate-400 hover:bg-white/[0.05] hover:text-white"><X size={16} /></button></header><div className="ck-scroll max-h-[62vh] overflow-y-auto p-3"><div className="grid gap-2 sm:grid-cols-2">{feed?.sources.map((source) => <a key={source.name} href={source.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 hover:border-cyan-300/25"><span className={`h-2 w-2 shrink-0 rounded-full ${source.status === "active" ? "bg-emerald-400" : "bg-amber-300"}`} /><span className="min-w-0 flex-1"><strong className="block truncate text-[12px] text-slate-100">{source.name}</strong><span className="mt-1 block text-[9px] text-slate-500">{source.category} · {source.language === "ko" ? "한국어" : "영문"}</span></span><span className="text-[9px] text-slate-600">{source.lastPublishedAt ? relativeTime(source.lastPublishedAt) : "수집 대기"}</span></a>)}</div></div></section></div>}
  </section>;
}

export function Home() {
  const { data: specs, loading } = useSchedule();
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [newsFeed, setNewsFeed] = useState<NewsFeed | null>(null);
  const brief = useMemo(() => buildHomeBrief(specs ?? []), [specs]);
  const review = useMemo(() => recentReview(specs ?? []), [specs]);
  const point = useMemo(() => technicalPoint(specs ?? []), [specs]);
  const openWork = (workspace: string, id: string) => navigate(`/schedule?reviewWorkspace=${encodeURIComponent(workspace)}&reviewSpec=${encodeURIComponent(id)}&returnTo=home`);

  useEffect(() => {
    let cancelled = false;
    getNewsFeed("ko").then((feed) => { if (!cancelled) setNewsFeed(feed); }).catch(() => { if (!cancelled) setNewsFeed({ items: [], fetchedAt: new Date().toISOString(), sourceCount: 0, sources: [] }); });
    return () => { cancelled = true; };
  }, []);

  return <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5">
    <section className="pt-1"><h1 className="text-[30px] font-semibold tracking-[-0.035em] text-[var(--color-text-bright)]">{dailyGreeting()}</h1><p className="mt-2 text-[14px] text-[var(--color-text-muted)]">{loading ? "개발 기록을 정리하고 있습니다." : brief.decisions.length > 0 ? `오늘 직접 판단할 리뷰가 ${brief.decisions.length}개 있습니다.` : "현재 판단을 기다리는 리뷰는 없습니다."}</p></section>

    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,.85fr)]">
      <div className="space-y-4">
        <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"><header className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4"><div><h2 className="text-lg font-semibold text-white">{review.label}</h2><p className="mt-1 text-[11px] text-slate-400">완료 기록을 한 일·쟁점·검증·남은 사항의 맥락으로 다시 봅니다.</p></div><Code2 size={18} className="text-cyan-300" /></header>{review.items.length > 0 ? <div>{review.items.map(({ spec, history }) => <button key={`${spec.id}:${history.version}`} type="button" onClick={() => openWork(spec.workspace_name, spec.id)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-[var(--color-border)] px-5 py-4 text-left last:border-b-0 hover:bg-white/[0.02]"><span className="min-w-0"><span className="flex items-center gap-2"><strong className="truncate text-[13px] text-slate-100">{spec.title}</strong><span className="shrink-0 rounded bg-violet-400/10 px-1.5 py-0.5 font-mono text-[9px] text-violet-200">{history.version === 0 ? "FEAT" : `PATCH ${history.version}`}</span></span><span className="mt-2 line-clamp-2 text-[11px] leading-5 text-slate-400">{firstSentence(history.summary)}</span><span className="mt-2 flex items-center gap-2 text-[9px] text-slate-600"><CheckCircle2 size={11} className="text-emerald-400" />파이프라인 완료 · {spec.workspace_name} · {history.completed_at ? relativeTime(history.completed_at) : ""}</span></span><ChevronRight size={16} className="text-slate-600" /></button>)}</div> : <div className="flex min-h-48 items-center justify-center px-6 text-center text-xs text-slate-500">최근 완료된 개발 기록이 없습니다.</div>}</section>

        <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"><header className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4"><div><h2 className="text-lg font-semibold text-white">오늘의 리뷰</h2><p className="mt-1 text-[11px] text-slate-400">승인, 수정 또는 기술적 판단이 실제로 필요한 작업만 표시합니다.</p></div><GitPullRequest size={18} className="text-violet-300" /></header>{brief.decisions.length > 0 ? <div>{brief.decisions.map((item) => <button key={`${item.workspace}:${item.id}`} type="button" onClick={() => openWork(item.workspace, item.id)} className="flex w-full items-center gap-3 border-b border-[var(--color-border)] px-5 py-4 text-left last:border-b-0 hover:bg-white/[0.02]"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-400/10 text-violet-300"><Eye size={15} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-[13px] text-slate-100">{item.title}</strong><span className="mt-1 block truncate text-[11px] text-slate-400">{item.detail}</span></span><span className="flex items-center gap-1 text-[10px] font-medium text-cyan-300">{item.actionLabel}<ArrowRight size={11} /></span></button>)}</div> : <div className="flex min-h-28 flex-col items-center justify-center px-6 text-center"><CheckCircle2 size={20} className="text-emerald-400" /><strong className="mt-2.5 text-[13px] text-slate-200">판단을 기다리는 리뷰가 없습니다</strong><span className="mt-1 text-[10px] text-slate-500">새 검토 요청이 도착하면 이곳에서 바로 이어갈 수 있습니다.</span></div>}</section>

        {point && <section className="rounded-xl border border-cyan-300/15 bg-[linear-gradient(110deg,rgba(16,39,53,.72),rgba(10,17,29,.92))] px-5 py-4"><div className="flex items-start gap-4"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-300/10 text-cyan-300"><Code2 size={15} /></span><div className="min-w-0 flex-1"><div className="text-[9px] font-semibold tracking-[0.16em] text-cyan-300">리뷰 노트</div><h2 className="mt-1.5 text-[14px] font-semibold text-slate-100">{point.title}</h2><p className="mt-2 line-clamp-3 text-[11px] leading-5 text-slate-400">{point.body}</p></div><button type="button" onClick={() => openWork(point.workspace, point.id)} className="mt-1 flex shrink-0 items-center gap-1 text-[10px] text-cyan-300">근거 보기<ArrowRight size={11} /></button></div></section>}
      </div>

      <TechBrief feed={newsFeed} userId={userId} />
    </div>
  </div>;
}
