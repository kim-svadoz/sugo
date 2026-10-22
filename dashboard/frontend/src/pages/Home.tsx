import { ArrowRight, BookOpenText, CheckCircle2, ChevronLeft, ChevronRight, Code2, Eye, GitPullRequest, Library, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getNewsFeed, type NewsFeed, type NewsItem } from "../api/newsApi.js";
import type { ScheduledSpec } from "../api/roadmapMutationsApi.js";
import { useAuth } from "../auth/AuthContext.js";
import { useSchedule } from "../hooks/useSchedule.js";
import { buildHomeBrief } from "../lib/homePresentation.js";
import { Modal } from "../components/Modal.js";
import { buildSevenDayFeed } from "../lib/techBriefPresentation.js";
import { selectLearningReviewNote, type LearningReviewNote } from "../lib/homeLearningReview.js";

function relativeTime(value: string): string {
  const hours = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 3_600_000));
  if (hours < 1) return "방금 전";
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
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

function LearningReviewModal({ note, onClose }: { note: LearningReviewNote; onClose: () => void }) {
  const test = note.verification;
  const testLabel = test.total == null ? (test.state === "pass" ? "통과" : "기록 없음") : `${test.passed ?? 0}/${test.total} 통과${test.failed ? ` · ${test.failed} 실패` : ""}`;
  const runtimeLabel = test.runtimeVerified === true ? "실행 환경 확인" : test.runtimeVerified === false ? "실행 환경 미확인" : "기록 없음";
  const verdictLabel = test.validationVerdict === "pass" ? "통과" : test.validationVerdict === "partial" ? "부분 확인" : test.validationVerdict === "fail" ? "실패" : "기록 없음";

  return <Modal onClose={onClose} size="wide">
    <article>
      <header className="border-b border-[var(--color-border)] pb-5">
        <div className="font-mono text-[10px] font-semibold tracking-[0.18em] text-cyan-300">LEARNING REVIEW</div>
        <h2 className="mt-2 text-2xl font-semibold tracking-[-0.025em] text-white">학습 리뷰 노트</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">{note.workTitle}에서 확인된 변경과 판단만 간결하게 정리했습니다.</p>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
          <span className="rounded-md border border-white/[0.08] bg-white/[0.025] px-2 py-1 text-slate-300">{note.workspace}</span>
          {note.patchVersion != null && <span className="rounded-md border border-violet-300/15 bg-violet-300/[0.06] px-2 py-1 text-violet-200">{note.patchVersions.length > 1 ? `PATCH ${note.patchVersions[0]}–${note.patchVersions.at(-1)}` : note.patchVersion === 0 ? "FEAT" : `PATCH ${note.patchVersion}`}</span>}
          {note.updatedAt && <span>{relativeTime(note.updatedAt)} 기록</span>}
        </div>
      </header>

      <section className="mt-5 rounded-xl border border-[var(--color-border)] bg-white/[0.015] px-5 py-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Code2 size={15} className="text-cyan-300" />이번 변경</h3>
        <ul className="mt-3 space-y-2">{note.summary.map((item, index) => <li key={`${index}:${item}`} className="flex gap-3 text-[12px] leading-6 text-slate-300 break-keep [overflow-wrap:anywhere]"><span className="text-cyan-300">{index + 1}.</span>{item}</li>)}</ul>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-[var(--color-border)] bg-white/[0.015] p-5"><h3 className="text-sm font-semibold text-slate-100">판단과 대안</h3><ul className="mt-3 space-y-2">{note.decisions.map((item, index) => <li key={`${index}:${item}`} className="flex gap-3 text-[12px] leading-6 text-slate-300 break-keep [overflow-wrap:anywhere]"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />{item}</li>)}</ul></section>
        {note.learnings.length > 0 && <section className="rounded-xl border border-violet-300/15 bg-violet-300/[0.025] p-5"><h3 className="text-sm font-semibold text-violet-100">남긴 학습</h3><ul className="mt-3 space-y-2">{note.learnings.map((item, index) => <li key={`${index}:${item}`} className="text-[12px] leading-6 text-slate-300 break-keep [overflow-wrap:anywhere]">{item}</li>)}</ul></section>}
      </div>

      <section className="mt-4 rounded-xl border border-[var(--color-border)] bg-white/[0.015] p-5"><h3 className="text-sm font-semibold text-slate-100">다음 확인</h3>{note.improvements.length > 0 ? <ul className="mt-3 grid gap-2 md:grid-cols-2">{note.improvements.map((item, index) => <li key={`${index}:${item}`} className="text-[12px] leading-6 text-slate-300 break-keep [overflow-wrap:anywhere]">{item}</li>)}</ul> : <p className="mt-3 text-xs text-slate-500">추가로 확인할 사항이 없습니다.</p>}</section>
      <footer className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-400/[0.04] px-4 py-3 text-[11px] text-slate-400"><CheckCircle2 size={14} className="text-emerald-400" /><span>검증</span><strong className="font-medium text-slate-200">{testLabel}</strong><span>·</span><span>{runtimeLabel}</span><span>·</span><span>{verdictLabel}</span></footer>
    </article>
  </Modal>;
}

function TechBrief({ feed, userId }: { feed: NewsFeed | null; userId: string | null }) {
  const storageKey = `sugo-tech-brief-bookmarks:${userId ?? "local"}`;
  const [tab, setTab] = useState<"latest" | "saved">("latest");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>();
  const [page, setPage] = useState(1);
  const [saved, setSaved] = useState<NewsItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "[]") as NewsItem[]; } catch { return []; }
  });
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(saved)); }, [saved, storageKey]);
  const weekly = buildSevenDayFeed(feed?.items ?? [], feed?.fetchedAt ?? new Date().toISOString(), selectedDay, page);
  const items = tab === "saved" ? saved.slice(0, 10) : weekly.items;
  const toggle = (item: NewsItem) => setSaved((current) => current.some((savedItem) => savedItem.url === item.url) ? current.filter((savedItem) => savedItem.url !== item.url) : [item, ...current]);

  return <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
    <div className="border-b border-[var(--color-border)] px-5 pt-4">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-[var(--color-text-bright)]">Engineering Feed</h2><p className="mt-1 text-[12px] font-normal leading-5 tracking-normal text-[var(--color-text-muted)]">기술 조직이 직접 공유한 새 글 · 매일 오전 8시 갱신</p></div><button type="button" onClick={() => setSourcesOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.055] px-2.5 py-1.5 text-[11px] font-medium tracking-normal text-cyan-200 hover:border-cyan-300/30 hover:bg-cyan-300/[0.09]"><Library size={14} />추적 채널 <strong className="font-mono text-cyan-100">{feed?.sourceCount ?? 0}</strong></button></div>
      <div className="mt-3 flex gap-5"><button type="button" onClick={() => setTab("latest")} className={`border-b-2 pb-2 text-[11px] font-medium tracking-normal ${tab === "latest" ? "border-cyan-300 text-cyan-200" : "border-transparent text-slate-500"}`}>최근 7일</button><button type="button" onClick={() => setTab("saved")} className={`border-b-2 pb-2 text-[11px] font-medium tracking-normal ${tab === "saved" ? "border-cyan-300 text-cyan-200" : "border-transparent text-slate-500"}`}>즐겨찾기 {saved.length > 0 && <span className="ml-1 text-cyan-300/70">{saved.length}</span>}</button></div>
    </div>
    {tab === "latest" && <div className="grid grid-cols-7 gap-1 border-b border-[var(--color-border)] px-4 py-3">{weekly.days.map((day) => <button key={day.key} type="button" onClick={() => { setSelectedDay(day.key); setPage(1); }} className={`rounded-lg px-1 py-2 text-center transition-colors ${weekly.selectedDay === day.key ? "bg-cyan-300/10 text-cyan-200" : "text-slate-500 hover:bg-white/[0.03] hover:text-slate-300"}`}><span className="block text-[9px]">{day.weekday}</span><strong className="mt-0.5 block text-[10px] font-semibold">{day.label}</strong><span className={`mt-1 block font-mono text-[8px] ${day.count > 0 ? "text-cyan-300/75" : "text-slate-700"}`}>{day.count}</span></button>)}</div>}
    {items.length > 0 ? <div className="px-5">{items.map((item) => <article key={item.url} className="group grid grid-cols-[minmax(0,1fr)_30px] gap-3 border-b border-[var(--color-border)] py-4 last:border-b-0"><a href={item.url} target="_blank" rel="noreferrer" className="min-w-0"><div><span className="text-[11px] font-medium tracking-normal text-cyan-300">{item.source}</span></div><h3 className="mt-2 line-clamp-2 text-[13px] font-medium leading-6 tracking-[-0.01em] text-slate-100 group-hover:text-cyan-200">{item.title}</h3><span className="mt-2 block text-[10px] font-normal leading-5 tracking-normal text-[var(--color-text-dim)]">{item.category}{item.language === "en" ? " · 영문 원문" : ""}</span></a><button type="button" onClick={() => toggle(item)} aria-label={saved.some((savedItem) => savedItem.url === item.url) ? "즐겨찾기 해제" : "즐겨찾기 저장"} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-white/[0.04] hover:text-amber-300"><Star size={15} fill={saved.some((savedItem) => savedItem.url === item.url) ? "currentColor" : "none"} className={saved.some((savedItem) => savedItem.url === item.url) ? "text-amber-300" : ""} /></button></article>)}</div> : <div className="flex min-h-44 flex-col items-center justify-center px-6 text-center"><BookOpenText size={22} className="text-slate-600" /><p className="mt-3 text-xs text-slate-400">{tab === "saved" ? "별표를 눌러 다시 읽을 글을 보관하세요." : "이 날짜에 수집된 새 글이 없습니다."}</p></div>}
    {tab === "latest" && weekly.pageCount > 1 && <footer className="flex items-center justify-center gap-3 border-t border-[var(--color-border)] px-4 py-3"><button type="button" aria-label="이전 페이지" disabled={weekly.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-md p-1 text-slate-400 hover:bg-white/[0.04] disabled:opacity-25"><ChevronLeft size={14} /></button><span className="font-mono text-[9px] text-slate-500">{weekly.page} / {weekly.pageCount}</span><button type="button" aria-label="다음 페이지" disabled={weekly.page >= weekly.pageCount} onClick={() => setPage((value) => Math.min(weekly.pageCount, value + 1))} className="rounded-md p-1 text-slate-400 hover:bg-white/[0.04] disabled:opacity-25"><ChevronRight size={14} /></button></footer>}
    {sourcesOpen && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourcesOpen(false); }}><section className="max-h-[78vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[#0a111d] shadow-2xl"><header className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4"><div><h3 className="text-base font-semibold text-white">추적 중인 기술 채널</h3><p className="mt-1 text-[11px] text-slate-400">공식 기술 블로그와 엔지니어링 채널 {feed?.sourceCount ?? 0}곳</p></div><button type="button" onClick={() => setSourcesOpen(false)} className="rounded-md p-2 text-slate-400 hover:bg-white/[0.05] hover:text-white"><X size={16} /></button></header><div className="ck-scroll max-h-[62vh] overflow-y-auto p-3"><div className="grid gap-2 sm:grid-cols-2">{feed?.sources.map((source) => <a key={source.name} href={source.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 hover:border-cyan-300/25"><span className={`h-2 w-2 shrink-0 rounded-full ${source.status === "active" ? "bg-emerald-400" : "bg-amber-300"}`} /><span className="min-w-0 flex-1"><strong className="block truncate text-[12px] text-slate-100">{source.name}</strong><span className="mt-1 block text-[9px] text-slate-500">{source.category} · {source.language === "ko" ? "한국어" : "영문"}</span></span><span className="text-[9px] text-slate-600">{source.lastPublishedAt ? relativeTime(source.lastPublishedAt) : "수집 대기"}</span></a>)}</div></div></section></div>}
  </section>;
}

export function Home() {
  const { data: specs, loading } = useSchedule();
  const { userId } = useAuth();
  const navigate = useNavigate();
  const [newsFeed, setNewsFeed] = useState<NewsFeed | null>(null);
  const [reviewNoteOpen, setReviewNoteOpen] = useState(false);
  const brief = useMemo(() => buildHomeBrief(specs ?? []), [specs]);
  const review = useMemo(() => recentReview(specs ?? []), [specs]);
  const point = useMemo(() => selectLearningReviewNote(review.items), [review.items]);
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
        <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"><header className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4"><div><h2 className="text-lg font-semibold text-white">{review.label}</h2><p className="mt-1 text-[11px] text-slate-400">완료 기록을 한 일·쟁점·검증·남은 사항의 맥락으로 다시 봅니다.</p></div><Code2 size={18} className="text-cyan-300" /></header>{review.items.length > 0 ? <div>{review.items.map(({ spec, history }) => <div key={`${spec.id}:${history.version}`} className="border-b border-[var(--color-border)] last:border-b-0"><button type="button" onClick={() => openWork(spec.workspace_name, spec.id)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 text-left hover:bg-white/[0.02]"><span className="min-w-0"><span className="flex items-center gap-2"><strong className="truncate text-[13px] text-slate-100">{spec.title}</strong><span className="shrink-0 rounded bg-violet-400/10 px-1.5 py-0.5 font-mono text-[9px] text-violet-200">{history.version === 0 ? "FEAT" : `PATCH ${history.version}`}</span></span><span className="mt-2 line-clamp-2 text-[11px] leading-5 text-slate-400">{firstSentence(history.summary)}</span><span className="mt-2 flex items-center gap-2 text-[9px] text-slate-600"><CheckCircle2 size={11} className="text-emerald-400" />파이프라인 완료 · {spec.workspace_name} · {history.completed_at ? relativeTime(history.completed_at) : ""}</span></span><ChevronRight size={16} className="text-slate-600" /></button>{point?.specId === spec.id && point.patchVersion === history.version && <div className="relative mx-5 mb-4 flex items-center gap-3 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.045] px-4 py-3"><span className="absolute -top-2 left-5 h-2 w-px bg-cyan-300/40" /><span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cyan-300/10 text-cyan-300"><span className="absolute inset-0 animate-ping rounded-md border border-cyan-300/15" /><Code2 size={13} /></span><span className="min-w-0 flex-1"><strong className="block text-[11px] text-cyan-100">이 작업의 학습 리뷰</strong><span className="mt-0.5 block truncate text-[10px] text-slate-400">설계 판단 {point.decisions.length}개 · 학습 {point.learnings.length}개 · 다음 보완 {point.improvements.length}개</span></span><button type="button" onClick={() => setReviewNoteOpen(true)} className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-cyan-300">리뷰 노트 보기<ArrowRight size={11} /></button></div>}</div>)}</div> : <div className="flex min-h-48 items-center justify-center px-6 text-center text-xs text-slate-500">최근 완료된 개발 기록이 없습니다.</div>}</section>

        <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"><header className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4"><div><h2 className="text-lg font-semibold text-white">오늘의 리뷰</h2><p className="mt-1 text-[11px] text-slate-400">승인, 수정 또는 기술적 판단이 실제로 필요한 작업만 표시합니다.</p></div><GitPullRequest size={18} className="text-violet-300" /></header>{brief.decisions.length > 0 ? <div>{brief.decisions.map((item) => <button key={`${item.workspace}:${item.id}`} type="button" onClick={() => openWork(item.workspace, item.id)} className="flex w-full items-center gap-3 border-b border-[var(--color-border)] px-5 py-4 text-left last:border-b-0 hover:bg-white/[0.02]"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-400/10 text-violet-300"><Eye size={15} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-[13px] text-slate-100">{item.title}</strong><span className="mt-1 block truncate text-[11px] text-slate-400">{item.detail}</span></span><span className="flex items-center gap-1 text-[10px] font-medium text-cyan-300">{item.actionLabel}<ArrowRight size={11} /></span></button>)}</div> : <div className="flex min-h-28 flex-col items-center justify-center px-6 text-center"><CheckCircle2 size={20} className="text-emerald-400" /><strong className="mt-2.5 text-[13px] text-slate-200">판단을 기다리는 리뷰가 없습니다</strong><span className="mt-1 text-[10px] text-slate-500">새 검토 요청이 도착하면 이곳에서 바로 이어갈 수 있습니다.</span></div>}</section>

      </div>

      <TechBrief feed={newsFeed} userId={userId} />
    </div>
    {point && reviewNoteOpen && <LearningReviewModal note={point} onClose={() => setReviewNoteOpen(false)} />}
  </div>;
}
