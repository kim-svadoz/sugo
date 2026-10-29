import { ArrowRight, BookOpenText, CheckCircle2, ChevronLeft, ChevronRight, Code2, Eye, GitPullRequest, Library, Star, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getNewsFeed, type NewsFeed, type NewsItem } from "../api/newsApi.js";
import { getOnboardingStatus, type ScheduledSpec } from "../api/roadmapMutationsApi.js";
import { useAuth } from "../auth/AuthContext.js";
import { useSchedule } from "../hooks/useSchedule.js";
import { buildHomeBrief } from "../lib/homePresentation.js";
import { Modal } from "../components/Modal.js";
import { WorkBoard } from "../components/WorkBoard.js";
import { buildSevenDayFeed, filterNewsByRegion, type NewsRegion } from "../lib/techBriefPresentation.js";
import { selectLearningReviewNote, type LearningReviewNote } from "../lib/homeLearningReview.js";
import { technicalIdentifierParts } from "../lib/technicalIdentifiers.js";
import { dailyGreeting } from "../lib/homeGreeting.js";
import { useProfile } from "../hooks/useProfile.js";
import { getWeatherRegion } from "../lib/weatherPreferences.js";
import { getWeeklySettings } from "../api/weeklyApi.js";
import { useOnboardingGuide } from "../components/OnboardingGuideContext.js";

function relativeTime(value: string): string {
  const hours = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 3_600_000));
  if (hours < 1) return "방금 전";
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function firstSentence(value: string | null | undefined): string {
  if (!value) return "기록된 작업 요약이 없습니다.";
  return value.split(/\n|(?<=[.!?])\s+/)[0].trim();
}

function TechnicalText({ children }: { children: string }) {
  return <>{technicalIdentifierParts(children).map((part, index) => part.code
    ? <code key={`${index}:${part.text}`} className="rounded bg-cyan-300/[0.07] px-1 py-0.5 font-mono text-[0.92em] text-cyan-100">{part.text}</code>
    : part.text)}</>;
}

function recentReview(specs: ScheduledSpec[]): { label: string; items: Array<{ spec: ScheduledSpec; histories: NonNullable<ScheduledSpec["development_history"]>; latestHistory: NonNullable<ScheduledSpec["development_history"]>[number] }> } {
  const groups = specs.flatMap((spec) => {
    const histories = [...(spec.development_history ?? [])].filter((history) => history.completed_at).sort((a, b) => Date.parse(b.completed_at!) - Date.parse(a.completed_at!));
    return histories[0] ? [{ spec, histories: histories.slice(0, 4), latestHistory: histories[0] }] : [];
  }).sort((a, b) => Date.parse(b.latestHistory.completed_at!) - Date.parse(a.latestHistory.completed_at!));
  return { label: "최근 작업 리뷰", items: groups.slice(0, 3) };
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
        <div className="mt-4 grid gap-2 sm:grid-cols-2">{note.summary.map((item, index) => <div key={`${index}:${item}`} className="rounded-lg border border-white/[0.06] bg-black/10 px-3.5 py-3"><div className="mb-2 font-mono text-[9px] tracking-[0.14em] text-cyan-400/70">CHANGE {String(index + 1).padStart(2, "0")}</div><p className="text-[12px] leading-6 text-slate-300 break-keep [overflow-wrap:anywhere]"><TechnicalText>{item}</TechnicalText></p></div>)}</div>
      </section>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-[var(--color-border)] bg-white/[0.015] p-5"><h3 className="text-sm font-semibold text-slate-100">판단과 대안</h3>{note.decisions.length > 0 ? <ul className="mt-3 space-y-3">{note.decisions.map((item, index) => <li key={`${index}:${item}`} className="border-l-2 border-cyan-300/40 pl-3 text-[12px] leading-6 text-slate-300 break-keep [overflow-wrap:anywhere]"><TechnicalText>{item}</TechnicalText></li>)}</ul> : <p className="mt-3 text-xs text-slate-500">기록된 판단과 대안이 없습니다.</p>}</section>
        <section className="rounded-xl border border-violet-300/15 bg-violet-300/[0.025] p-5"><h3 className="text-sm font-semibold text-violet-100">남긴 학습</h3>{note.learnings.length > 0 ? <ul className="mt-3 space-y-3">{note.learnings.map((item, index) => <li key={`${index}:${item}`} className="flex gap-2 text-[12px] leading-6 text-slate-300 break-keep [overflow-wrap:anywhere]"><span className="text-violet-300">→</span><span><TechnicalText>{item}</TechnicalText></span></li>)}</ul> : <p className="mt-3 text-xs text-slate-500">별도로 기록된 기술 학습이 없습니다.</p>}</section>
      </div>

      <section className="mt-4 rounded-xl border border-[var(--color-border)] bg-white/[0.015] p-5"><h3 className="text-sm font-semibold text-slate-100">다음 확인</h3>{note.improvements.length > 0 ? <ul className="mt-3 grid gap-2 md:grid-cols-2">{note.improvements.map((item, index) => <li key={`${index}:${item}`} className="text-[12px] leading-6 text-slate-300 break-keep [overflow-wrap:anywhere]">{item}</li>)}</ul> : <p className="mt-3 text-xs text-slate-500">추가로 확인할 사항이 없습니다.</p>}</section>
      <footer className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-400/[0.04] px-4 py-3 text-[11px] text-slate-400"><CheckCircle2 size={14} className="text-emerald-400" /><span>검증</span><strong className="font-medium text-slate-200">{testLabel}</strong><span>·</span><span>{runtimeLabel}</span><span>·</span><span>{verdictLabel}</span></footer>
    </article>
  </Modal>;
}

function TechBrief({ feed, userId }: { feed: NewsFeed | null; userId: string | null }) {
  const storageKey = `sugo-tech-brief-bookmarks:${userId ?? "local"}`;
  const removedStorageKey = `sugo-tech-brief-recently-removed:${userId ?? "local"}`;
  const [tab, setTab] = useState<"latest" | "saved">("latest");
  const [region, setRegion] = useState<NewsRegion>("all");
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>();
  const [page, setPage] = useState(1);
  const [saved, setSaved] = useState<NewsItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "[]") as NewsItem[]; } catch { return []; }
  });
  const [recentlyRemoved, setRecentlyRemoved] = useState<NewsItem | null>(() => {
    try { return JSON.parse(localStorage.getItem(removedStorageKey) ?? "null") as NewsItem | null; } catch { return null; }
  });
  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(saved)); }, [saved, storageKey]);
  useEffect(() => {
    if (recentlyRemoved) localStorage.setItem(removedStorageKey, JSON.stringify(recentlyRemoved));
    else localStorage.removeItem(removedStorageKey);
  }, [recentlyRemoved, removedStorageKey]);
  const regionalItems = filterNewsByRegion(feed?.items ?? [], region);
  const weekly = buildSevenDayFeed(regionalItems, feed?.fetchedAt ?? new Date().toISOString(), selectedDay, page);
  const items = tab === "saved" ? filterNewsByRegion(saved, region).slice(0, 10) : weekly.items;
  const toggle = (item: NewsItem) => setSaved((current) => {
    const isSaved = current.some((savedItem) => savedItem.url === item.url);
    if (isSaved) {
      setRecentlyRemoved(item);
      return current.filter((savedItem) => savedItem.url !== item.url);
    }
    setRecentlyRemoved(null);
    return [item, ...current];
  });
  const restoreRecentlyRemoved = () => {
    if (!recentlyRemoved) return;
    setSaved((current) => current.some((item) => item.url === recentlyRemoved.url) ? current : [recentlyRemoved, ...current]);
    setRecentlyRemoved(null);
  };

  return <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
    <div className="border-b border-[var(--color-border)] px-5 pt-4">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-semibold text-[var(--color-text-bright)]">Engineering Feed</h2><p className="mt-1 text-[12px] font-normal leading-5 tracking-normal text-[var(--color-text-muted)]">기술 블로그 모음</p></div><button type="button" onClick={() => setSourcesOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.055] px-2.5 py-1.5 text-[11px] font-medium tracking-normal text-cyan-200 hover:border-cyan-300/30 hover:bg-cyan-300/[0.09]"><Library size={14} />추적 채널 <strong className="font-mono text-cyan-100">{feed?.sourceCount ?? 0}</strong></button></div>
      <div className="mt-3 flex items-end justify-between gap-3"><div className="flex gap-5"><button type="button" onClick={() => setTab("latest")} className={`border-b-2 pb-2 text-[11px] font-medium tracking-normal ${tab === "latest" ? "border-cyan-300 text-cyan-200" : "border-transparent text-slate-500"}`}>최근 7일</button><button type="button" onClick={() => setTab("saved")} className={`border-b-2 pb-2 text-[11px] font-medium tracking-normal ${tab === "saved" ? "border-cyan-300 text-cyan-200" : "border-transparent text-slate-500"}`}>보관 {saved.length > 0 && <span className="ml-1 text-cyan-300/70">{saved.length}</span>}</button></div><div className="mb-1 flex rounded-md border border-white/[0.07] bg-black/10 p-0.5">{([['all', '전체'], ['domestic', '국내'], ['global', '국외']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => { setRegion(value); setPage(1); }} className={`rounded px-2 py-1 text-[9px] ${region === value ? "bg-cyan-300/10 text-cyan-200" : "text-slate-500 hover:text-slate-300"}`}>{label}</button>)}</div></div>
    </div>
    {tab === "latest" && <div className="grid grid-cols-7 gap-1 border-b border-[var(--color-border)] px-4 py-3">{weekly.days.map((day) => <button key={day.key} type="button" onClick={() => { setSelectedDay(day.key); setPage(1); }} className={`relative rounded-lg border px-1 py-2 text-center transition-colors ${day.isToday ? "border-cyan-200/80 bg-transparent shadow-[0_0_12px_rgba(103,232,249,0.2)]" : weekly.selectedDay === day.key ? "border-cyan-300/25" : "border-transparent"} ${weekly.selectedDay === day.key ? "bg-cyan-300/10 text-cyan-200" : "text-slate-500 hover:bg-white/[0.03] hover:text-slate-300"}`}><span className="block text-[9px]">{day.weekday}</span><strong className="mt-0.5 block text-[10px] font-semibold">{day.label}</strong><span className={`mt-1 block font-mono text-[8px] ${day.count > 0 ? "text-cyan-300/75" : "text-slate-700"}`}>{day.count}</span></button>)}</div>}
    {items.length > 0 ? <div className="px-5">{items.map((item) => {
      const isSaved = saved.some((savedItem) => savedItem.url === item.url);
      return <article key={item.url} className="group grid grid-cols-[minmax(0,1fr)_30px] gap-3 border-b border-[var(--color-border)] py-4 last:border-b-0"><a href={item.url} target="_blank" rel="noreferrer" className="min-w-0"><div><span className="text-[11px] font-medium tracking-normal text-cyan-300">{item.source}</span></div><h3 className="mt-2 line-clamp-2 text-[13px] font-medium leading-6 tracking-[-0.01em] text-slate-100 group-hover:text-cyan-200">{item.title}</h3><span className="mt-2 block text-[10px] font-normal leading-5 tracking-normal text-[var(--color-text-dim)]">{item.category}{item.language === "en" ? " · 영문 원문" : ""}</span></a><button type="button" onClick={() => toggle(item)} aria-label={isSaved ? "보관 해제" : "보관하기"} className="flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-white/[0.04] hover:text-amber-300"><Star size={15} fill={isSaved ? "currentColor" : "none"} className={isSaved ? "text-amber-300" : ""} /></button></article>;
    })}</div> : <div className="flex min-h-44 flex-col items-center justify-center px-6 text-center"><BookOpenText size={22} className="text-slate-600" /><p className="mt-3 text-xs text-slate-400">{tab === "saved" ? "별표를 눌러 다시 읽을 글을 보관하세요." : "이 날짜에 수집된 새 글이 없습니다."}</p></div>}
    {recentlyRemoved && <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] bg-amber-300/[0.035] px-5 py-2.5"><span className="min-w-0 truncate text-[10px] text-slate-400"><strong className="text-amber-100">보관에서 뺐습니다.</strong> {recentlyRemoved.title}</span><button type="button" onClick={restoreRecentlyRemoved} className="shrink-0 text-[10px] font-semibold text-cyan-300 hover:text-cyan-100">되돌리기</button></div>}
    {tab === "latest" && weekly.pageCount > 1 && <footer className="flex items-center justify-center gap-3 border-t border-[var(--color-border)] px-4 py-3"><button type="button" aria-label="이전 페이지" disabled={weekly.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-md p-1 text-slate-400 hover:bg-white/[0.04] disabled:opacity-25"><ChevronLeft size={14} /></button><span className="font-mono text-[9px] text-slate-500">{weekly.page} / {weekly.pageCount}</span><button type="button" aria-label="다음 페이지" disabled={weekly.page >= weekly.pageCount} onClick={() => setPage((value) => Math.min(weekly.pageCount, value + 1))} className="rounded-md p-1 text-slate-400 hover:bg-white/[0.04] disabled:opacity-25"><ChevronRight size={14} /></button></footer>}
    {sourcesOpen && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setSourcesOpen(false); }}><section className="max-h-[78vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[#0a111d] shadow-2xl"><header className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4"><div><h3 className="text-base font-semibold text-white">추적 중인 기술 채널</h3><p className="mt-1 text-[11px] text-slate-400">공식 기술 블로그와 엔지니어링 채널 {feed?.sourceCount ?? 0}곳</p></div><button type="button" onClick={() => setSourcesOpen(false)} className="rounded-md p-2 text-slate-400 hover:bg-white/[0.05] hover:text-white"><X size={16} /></button></header><div className="ck-scroll max-h-[62vh] overflow-y-auto p-3"><div className="grid gap-2 sm:grid-cols-2" role="list" aria-label="추적 채널 목록">{feed?.sources.map((source) => <div key={source.name} role="listitem" className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3"><span className={`h-2 w-2 shrink-0 rounded-full ${source.status === "active" ? "bg-emerald-400" : "bg-amber-300"}`} /><span className="min-w-0 flex-1"><strong className="block truncate text-[12px] text-slate-100">{source.name}</strong><span className="mt-1 block text-[9px] text-slate-500">{source.category} · {source.language === "ko" ? "한국어" : "영문"}</span></span><span className="text-[9px] text-slate-600">{source.lastPublishedAt ? relativeTime(source.lastPublishedAt) : "수집 대기"}</span></div>)}</div></div></section></div>}
  </section>;
}

export function Home() {
  const { data: specs, loading } = useSchedule();
  const { userId } = useAuth();
  const { profile } = useProfile(userId);
  const navigate = useNavigate();
  const { setPlaybookGuideVisible } = useOnboardingGuide();
  const [newsFeed, setNewsFeed] = useState<NewsFeed | null>(null);
  const [selectedNote, setSelectedNote] = useState<LearningReviewNote | null>(null);
  const [weeklyConfigured, setWeeklyConfigured] = useState<boolean | null>(null);
  const [showPlaybookGuide, setShowPlaybookGuide] = useState(false);
  const setupMissing = [!profile?.displayName ? "표시 이름" : null, !getWeatherRegion() ? "날씨 생활권" : null, weeklyConfigured === false ? "주간 리포트" : null].filter(Boolean) as string[];
  const brief = useMemo(() => buildHomeBrief(specs ?? []), [specs]);
  const review = useMemo(() => recentReview(specs ?? []), [specs]);
  const notes = useMemo(() => new Map(review.items.flatMap(({ spec, histories }) => {
    const note = selectLearningReviewNote(histories.map((history) => ({ spec, history })));
    return note ? [[spec.id, note] as const] : [];
  })), [review.items]);
  const openWork = (workspace: string, id: string) => navigate(`/schedule?reviewWorkspace=${encodeURIComponent(workspace)}&reviewSpec=${encodeURIComponent(id)}&returnTo=home`);

  useEffect(() => {
    let cancelled = false;
    getNewsFeed("ko").then((feed) => { if (!cancelled) setNewsFeed(feed); }).catch(() => { if (!cancelled) setNewsFeed({ items: [], fetchedAt: new Date().toISOString(), sourceCount: 0, sources: [] }); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getOnboardingStatus(userId)
      .then((status) => { if (!cancelled) setShowPlaybookGuide(status.shouldGuideToPlaybook); })
      .catch(() => { if (!cancelled) setShowPlaybookGuide(false); });
    return () => { cancelled = true; };
  }, [userId]);
  useEffect(() => {
    setPlaybookGuideVisible(showPlaybookGuide);
    return () => setPlaybookGuideVisible(false);
  }, [setPlaybookGuideVisible, showPlaybookGuide]);
  useEffect(() => {
    let cancelled = false;
    getWeeklySettings().then((settings) => { if (!cancelled) setWeeklyConfigured(settings.configured); }).catch(() => { if (!cancelled) setWeeklyConfigured(null); });
    return () => { cancelled = true; };
  }, []);

  return <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-5">
    <section className="flex items-start justify-between gap-4 pt-1"><div><h1 className="text-[30px] font-semibold tracking-[-0.035em] text-[var(--color-text-bright)]">{dailyGreeting()}</h1><p className="mt-2 text-[14px] text-[var(--color-text-muted)]">{loading ? "개발 기록을 정리하고 있습니다." : brief.decisions.length > 0 ? `오늘 확인할 리뷰가 ${brief.decisions.length}개 있습니다.` : "지금 확인할 리뷰는 없습니다."}</p></div></section>

    {setupMissing.length > 0 && <section className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.045] px-4 py-3"><span className="min-w-0 flex-1 text-[12px] text-slate-300"><strong className="text-amber-200">처음 설정을 마치면 Home이 내 작업 방식에 맞춰집니다.</strong><span className="ml-2 text-slate-500">남은 설정 · {setupMissing.join(" · ")}</span></span><button type="button" onClick={() => navigate(`/preferences?tab=${setupMissing[0] === "날씨 생활권" ? "weather" : setupMissing[0] === "주간 리포트" ? "weekly" : "general"}`)} className="rounded-lg border border-amber-300/25 px-3 py-1.5 text-[11px] font-semibold text-amber-100">설정 이어가기</button></section>}

    <section className="relative overflow-hidden rounded-2xl border border-cyan-300/15 bg-[linear-gradient(110deg,rgba(8,47,73,.42),rgba(10,18,32,.92)_48%,rgba(76,29,149,.16))] px-5 py-4" aria-label="오늘의 Sugo 작업 장면">
      <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-cyan-300/[0.06] blur-3xl" />
      <div className="relative grid items-center gap-5 xl:grid-cols-[minmax(260px,.75fr)_minmax(0,1.4fr)_auto]">
        <div data-onboarding-tour-target={showPlaybookGuide ? "home" : undefined} className="-m-3 p-3"><span className="font-mono text-[9px] font-bold tracking-[0.18em] text-cyan-300">TODAY IN SUGO</span><h2 className="mt-1.5 text-[18px] font-semibold text-white">오늘 이어갈 작업과 확인할 일을 모았습니다</h2><p className="mt-1 text-[11px] leading-5 text-slate-400">진행 중인 개발, 내 확인이 필요한 일, 최근 완료 결과를 한곳에서 확인합니다.</p></div>
        <div className="grid grid-cols-2 gap-2">
          {brief.resume.length > 0 && <div className="relative rounded-xl border border-cyan-300/15 bg-cyan-300/[0.045] px-4 py-3"><div className="absolute left-4 top-0 h-px w-8 bg-cyan-300" /><span className="text-[9px] text-cyan-200/70">진행 중</span><strong className="mt-1 block font-mono text-[20px] text-white">{brief.resume.length}</strong><span className="mt-0.5 block text-[9px] text-slate-400">현재 이어가는 파이프라인</span></div>}
          {brief.decisions.length > 0 && <div className="relative rounded-xl border border-violet-300/15 bg-violet-300/[0.045] px-4 py-3"><div className="absolute left-4 top-0 h-px w-8 bg-violet-300" /><span className="text-[9px] text-violet-200/70">확인 필요</span><strong className="mt-1 block font-mono text-[20px] text-white">{brief.decisions.length}</strong><span className="mt-0.5 block text-[9px] text-slate-400">내 판단을 기다리는 작업</span></div>}
          {!loading && brief.resume.length === 0 && brief.decisions.length === 0 && <div className="col-span-2 rounded-xl border border-white/[0.07] bg-black/15 px-4 py-3"><span className="text-[11px] font-medium text-slate-200">AI가 다음 작업을 기다리며 쉬고 있습니다</span><span className="mt-1 block text-[9px] text-slate-500">진행 중인 파이프라인과 확인 요청이 없습니다.</span></div>}
        </div>
        <button type="button" onClick={() => navigate(brief.decisions.length > 0 ? "/schedule" : "/sessions")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/25 bg-cyan-300/[0.08] px-4 py-3 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-300/[0.14]">{brief.decisions.length > 0 ? "판단할 작업 열기" : "작업 흐름 보기"}<ArrowRight size={13} /></button>
      </div>
      <div data-onboarding-tour-target={showPlaybookGuide ? "pipeline" : undefined} className="relative mt-4 border-t border-white/[0.06] pt-3"><WorkBoard specs={specs ?? []} waitingReviews={brief.decisions.length} /></div>
    </section>

    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(360px,.85fr)]">
      <div className="space-y-4">
        <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"><header className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4"><div><h2 className="text-lg font-semibold text-white">{review.label}</h2><p className="mt-1 text-[11px] text-slate-400">같은 작업의 FEAT와 PATCH를 묶어, 마지막 완료 결과 기준 최근 3개만 보여줍니다.</p></div><Code2 size={18} className="text-cyan-300" /></header>{review.items.length > 0 ? <div>{review.items.map(({ spec, histories, latestHistory }) => { const note = notes.get(spec.id); return <div key={spec.id} className="border-b border-[var(--color-border)] last:border-b-0"><button type="button" onClick={() => openWork(spec.workspace_name, spec.id)} className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-4 text-left hover:bg-white/[0.02]"><span className="min-w-0"><span className="flex flex-wrap items-center gap-2"><strong className="truncate text-[13px] text-slate-100">{spec.title}</strong>{[...histories].reverse().map((history) => <span key={history.version} className="shrink-0 rounded bg-violet-400/10 px-1.5 py-0.5 font-mono text-[9px] text-violet-200">{history.version === 0 ? "FEAT" : `PATCH ${history.version}`}</span>)}</span><span className="mt-2 line-clamp-2 text-[11px] leading-5 text-slate-400">{firstSentence(latestHistory.summary)}</span><span className="mt-2 flex items-center gap-2 text-[9px] font-medium text-slate-400"><CheckCircle2 size={11} className="text-emerald-300" />마지막 완료 · {spec.workspace_name} · {latestHistory.completed_at ? relativeTime(latestHistory.completed_at) : ""}</span></span><ChevronRight size={16} className="text-slate-600" /></button>{note && <div className="relative mx-5 mb-4 flex items-center gap-3 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.045] px-4 py-3"><span className="absolute -top-2 left-5 h-2 w-px bg-cyan-300/40" /><span className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-cyan-300/10 text-cyan-300"><span className="absolute inset-0 animate-ping rounded-md border border-cyan-300/15" /><Code2 size={13} /></span><span className="min-w-0 flex-1"><strong className="block text-[11px] text-cyan-100">마지막 결과 학습 리뷰</strong><span className="mt-0.5 block truncate text-[10px] text-slate-400">설계 판단 {note.decisions.length}개 · 학습 {note.learnings.length}개 · 다음 보완 {note.improvements.length}개</span></span><button type="button" onClick={() => setSelectedNote(note)} className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-cyan-300">리뷰 노트 보기<ArrowRight size={11} /></button></div>}</div>; })}</div> : <div className="flex min-h-48 items-center justify-center px-6 text-center text-xs text-slate-500">최근 완료된 개발 기록이 없습니다.</div>}</section>

        <section className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]"><header className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4"><div><h2 className="text-lg font-semibold text-white">오늘의 리뷰</h2><p className="mt-1 text-[11px] text-slate-400">승인, 수정 또는 기술적 판단이 실제로 필요한 작업만 표시합니다.</p></div><GitPullRequest size={18} className="text-violet-300" /></header>{brief.decisions.length > 0 ? <div>{brief.decisions.map((item) => <button key={`${item.workspace}:${item.id}`} type="button" onClick={() => openWork(item.workspace, item.id)} className="flex w-full items-center gap-3 border-b border-[var(--color-border)] px-5 py-4 text-left last:border-b-0 hover:bg-white/[0.02]"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-400/10 text-violet-300"><Eye size={15} /></span><span className="min-w-0 flex-1"><strong className="block truncate text-[13px] text-slate-100">{item.title}</strong><span className="mt-1 block truncate text-[11px] text-slate-400">{item.detail}</span></span><span className="flex items-center gap-1 text-[10px] font-medium text-cyan-300">{item.actionLabel}<ArrowRight size={11} /></span></button>)}</div> : <div className="flex min-h-28 flex-col items-center justify-center px-6 text-center"><CheckCircle2 size={20} className="text-emerald-400" /><strong className="mt-2.5 text-[13px] text-slate-200">판단을 기다리는 리뷰가 없습니다</strong><span className="mt-1 text-[10px] text-slate-500">새 검토 요청이 도착하면 이곳에서 바로 이어갈 수 있습니다.</span></div>}</section>

      </div>

      <TechBrief feed={newsFeed} userId={userId} />
    </div>
    {selectedNote && <LearningReviewModal note={selectedNote} onClose={() => setSelectedNote(null)} />}
  </div>;
}
