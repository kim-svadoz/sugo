import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getWeeklyReport, getWeeklySettings, listWeeklyReports, type WeeklyReportDetail, type WeeklyReportSummary } from "../api/weeklyApi.js";
import { toWeeklyView, type WeeklyLearningView, type WeeklyTopicView } from "../lib/weeklyPresentation.js";
import { cn } from "../lib/utils.js";
import { PageHeading } from "../components/PageHeading.js";
import { NoticeBar } from "../components/NoticeBar.js";
import { readWeeklyRouteState, writeWeeklyRouteState, type WeeklyDetailView } from "../lib/weeklyRouteState.js";
import { selectWeeklySection } from "../lib/weeklyScrollSpy.js";

function findScrollContainer(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent) {
    const overflowY = window.getComputedStyle(parent).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && parent.scrollHeight > parent.clientHeight) return parent;
    parent = parent.parentElement;
  }
  return null;
}

function useWeeklyScrollSpy(ids: string[], enabled: boolean) {
  const idsKey = ids.join("\u0000");
  const [active, setActive] = useState(ids[0] ?? "");

  useEffect(() => setActive(ids[0] ?? ""), [idsKey]);
  useEffect(() => {
    if (!enabled || !idsKey) return;
    const elements = idsKey.split("\u0000").map((id) => document.getElementById(id)).filter((element): element is HTMLElement => Boolean(element));
    if (elements.length === 0) return;
    const scrollContainer = findScrollContainer(elements[0]);
    const scrollTarget: HTMLElement | Window = scrollContainer ?? window;
    let animationFrame = 0;
    const update = () => {
      animationFrame = 0;
      const viewportTop = scrollContainer?.getBoundingClientRect().top ?? 0;
      const viewportHeight = scrollContainer?.clientHeight ?? window.innerHeight;
      const readingLine = viewportTop + Math.min(180, viewportHeight * 0.22);
      const next = selectWeeklySection(elements.map((element) => {
        const bounds = element.getBoundingClientRect();
        return { id: element.id, top: bounds.top, bottom: bounds.bottom };
      }), readingLine);
      setActive((current) => current === next ? current : next);
    };
    const scheduleUpdate = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(update);
    };
    scheduleUpdate();
    scrollTarget.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      scrollTarget.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (animationFrame) cancelAnimationFrame(animationFrame);
    };
  }, [enabled, idsKey]);

  return [active, setActive] as const;
}

function Bullets({ items, warn = false }: { items: string[]; warn?: boolean }) {
  return <ul className="space-y-1.5 text-[13px] leading-[1.65] text-[var(--color-text)]">{items.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2.5"><span className={cn("mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full", warn ? "bg-amber-400" : "bg-cyan-400/70")} /><span className="min-w-0 break-words">{item}</span></li>)}</ul>;
}

function Count({ children }: { children: number }) { return <span className="ml-1.5 font-mono text-[11px] opacity-60">{children}</span>; }

function Topic({ topic }: { topic: WeeklyTopicView }) {
  const facts: Array<[string, string[]]> = [["상황", topic.context ? [topic.context] : []], ["목적", topic.goal ? [topic.goal] : []], ["한 일", topic.done], ["검증", topic.results]];
  return <article className="overflow-hidden panel-card rounded-xl border">
    <header className="border-b border-[var(--color-border)] px-5 py-4"><div className="flex flex-wrap items-center gap-2"><h3 className="text-[16px] font-bold tracking-tight text-cyan-100">{topic.title}</h3>{topic.category && <CategoryTag category={topic.category} />}{topic.workspace && <Tag mono>{topic.workspace}</Tag>}</div>{topic.oneLine && <p className="mt-2 max-w-4xl text-[14px] leading-[1.6] text-slate-300">{topic.oneLine}</p>}</header>
    <div className="grid gap-x-8 gap-y-5 px-5 py-5 xl:grid-cols-2">{facts.map(([label, items]) => items.length ? <section key={label}><Label accent>{label}</Label><Bullets items={items} /></section> : null)}</div>
    {topic.todo.length > 0 && <section className="mx-5 mb-5 overflow-hidden rounded-lg border border-amber-400/30 bg-amber-400/[0.07]"><h4 className="border-b border-amber-400/20 px-4 py-2 text-[13px] font-bold text-amber-200">남은 일 <Count>{topic.todo.length}</Count></h4><ul className="divide-y divide-amber-400/10">{topic.todo.map((item) => <li key={`${item.kind}-${item.text}`} className="flex items-start gap-3 px-4 py-3 text-[15px] leading-[1.6]"><span className="mt-0.5 shrink-0 rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] font-bold text-amber-200">{item.kind || "작업"}</span><span className="text-slate-200">{item.text}</span></li>)}</ul></section>}
  </article>;
}

function Label({ children, warn = false, accent = false }: { children: React.ReactNode; warn?: boolean; accent?: boolean }) { return <p className={cn("mb-2 text-[11px] font-bold uppercase tracking-[0.08em]", warn ? "text-amber-300" : accent ? "text-cyan-300" : "text-slate-400")}>{children}</p>; }
function Tag({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) { return <span className={cn("rounded-full bg-cyan-400/10 px-2.5 py-1 text-[11px] text-cyan-200", mono && "font-mono")}>{children}</span>; }
function CategoryTag({ category }: { category: string }) {
  const tone = ({ 기능: "bg-cyan-400/15 text-cyan-200", 수정: "bg-violet-400/15 text-violet-200", 개선: "bg-emerald-400/15 text-emerald-200", 도구: "bg-blue-400/15 text-blue-200", 운영: "bg-amber-400/15 text-amber-200" } as Record<string, string>)[category] ?? "bg-slate-400/15 text-slate-200";
  return <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", tone)}>{category}</span>;
}

function JumpTabs({ label, items, active, onSelect }: { label: string; items: Array<{ id: string; label: string }>; active: string; onSelect: (id: string) => void }) {
  return <nav aria-label={label} className="sticky top-0 z-20 -mx-1 overflow-x-auto border-y border-[var(--color-border)] bg-[var(--color-background)]/95 px-1 py-2 backdrop-blur">
    <div className="flex min-w-max gap-1">{items.map((item, index) => <button key={item.id} type="button" aria-current={active === item.id ? "true" : undefined} onClick={() => onSelect(item.id)} className={cn("max-w-[280px] rounded-lg px-3 py-2 text-left text-[13px] font-semibold transition-colors", active === item.id ? "bg-cyan-400/15 text-cyan-100 ring-1 ring-inset ring-cyan-400/35" : "text-[var(--color-text-muted)] hover:bg-white/[0.04] hover:text-[var(--color-text)]")}><span className="mr-2 font-mono text-[11px] opacity-50">{String(index + 1).padStart(2, "0")}</span><span className="inline-block max-w-[220px] truncate align-bottom">{item.label}</span></button>)}</div>
  </nav>;
}

function LearningCard({ item }: { item: WeeklyLearningView }) {
  const panels: Array<[string, string[], string]> = [["핵심 개념", item.keyPoints, ""], ["동작 원리", item.howItWorks, ""], ["이번 작업에서의 예", item.example, "bg-[var(--color-background)]"], ["쓸 때", item.whenToUse, ""], ["피할 때", item.whenNotToUse, ""], ["흔한 함정", item.pitfalls, "border-amber-400/25 bg-amber-400/5"]];
  const rationale = [...item.rationaleRecorded, ...item.rationaleUnverified.map((value) => `근거 기록 없음 · ${value}`), ...(item.rationaleGeneral ? [`일반론 · ${item.rationaleGeneral}`] : [])];
  return <article className="overflow-hidden panel-card rounded-xl border">
    <header className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-5 py-4"><h3 className="mr-1 text-[18px] font-bold tracking-tight text-cyan-100">{item.name}</h3>{item.category && <Tag>{item.category}</Tag>}{item.level && <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 text-[11px] font-semibold text-violet-200">{item.level}</span>}{item.relatedTopics.length > 0 && <p className="mt-1 flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-400"><span className="font-semibold text-slate-500">쓰인 작업</span>{item.relatedTopics.map((topic) => <span key={topic} className="rounded-md bg-slate-400/10 px-2 py-0.5 text-slate-300">{topic}</span>)}</p>}</header>
    {item.definition && <p className="mx-5 mt-4 border-l-[3px] border-cyan-400 bg-cyan-400/[0.06] px-4 py-3 text-[16px] font-semibold leading-[1.7] text-[var(--color-text-bright)]">{item.definition}</p>}
    <div className="grid gap-3 p-5 lg:grid-cols-2">{panels.map(([label, values, tone]) => values.length ? <section key={label} className={cn("rounded-lg border border-[var(--color-border)] px-4 py-3", tone)}><Label accent={label !== "흔한 함정"} warn={label === "흔한 함정"}>{label}</Label><Bullets items={values} warn={label === "흔한 함정"} /></section> : null)}</div>
    {item.alternatives.length > 0 && <section className="mx-5 mb-5 overflow-x-auto"><Label>대체재 비교</Label><table className="w-full min-w-[660px] text-left text-[13px]"><thead className="bg-[var(--color-background)] text-[11px] text-[var(--color-text-muted)]"><tr>{["대체재", "장점", "단점", "더 맞는 상황"].map((head) => <th key={head} className="border-b border-[var(--color-border)] px-3 py-2">{head}</th>)}</tr></thead><tbody>{item.alternatives.map((alt) => <tr key={alt.name} className="border-b border-[var(--color-border)] last:border-0"><td className="px-3 py-2 font-semibold">{alt.name}</td><td className="px-3 py-2">{alt.pros}</td><td className="px-3 py-2">{alt.cons}</td><td className="px-3 py-2">{alt.when}</td></tr>)}</tbody></table></section>}
    {(item.complements.length > 0 || rationale.length > 0 || item.quiz.length > 0 || item.keywords.length > 0) && <div className="grid gap-5 border-t border-[var(--color-border)] px-5 py-4 lg:grid-cols-[1fr_.75fr]"><div className="space-y-4">{item.complements.length > 0 && <section><Label>보완재</Label><Bullets items={item.complements.map((value) => `${value.name} — ${value.why}`)} /></section>}{rationale.length > 0 && <section><Label>선택 근거</Label><Bullets items={rationale} /></section>}</div><div className="space-y-3">{item.quiz.map((quiz) => <details key={quiz.question} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-[13px]"><summary className="cursor-pointer font-semibold">Q. {quiz.question}</summary><p className="mt-2">{quiz.answer}</p></details>)}{item.keywords.length > 0 && <div className="flex flex-wrap gap-1.5">{item.keywords.map((keyword) => <Tag key={keyword}>{keyword}</Tag>)}</div>}</div></div>}
  </article>;
}

function ReportBody({ detail, tab, onTabChange }: { detail: WeeklyReportDetail; tab: WeeklyDetailView; onTabChange: (tab: WeeklyDetailView) => void }) {
  const view = useMemo(() => toWeeklyView(detail.report), [detail]);
  const topicTabs = useMemo(() => view.topics.map((topic, index) => ({ id: `weekly-topic-${index}`, label: topic.title })), [view.topics]);
  const learningTabs = useMemo(() => view.learning.map((item, index) => ({ id: `weekly-learning-${index}`, label: item.name })), [view.learning]);
  const [activeTopic, setActiveTopic] = useWeeklyScrollSpy(topicTabs.map((item) => item.id), tab === "report");
  const [activeLearning, setActiveLearning] = useWeeklyScrollSpy(learningTabs.map((item) => item.id), tab === "learning");
  const jumpTo = (id: string, setActive: (id: string) => void) => { setActive(id); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const sections = [["plan", "지난주 계획", view.lastWeekPlan.length], ["topics", "주제", view.topics.length], ["blocked", "막힌 것", view.blocked.length], ["next", "다음 주", view.nextWeek.length]] as const;
  return <div>
    <nav className="mb-5 flex gap-8 border-b border-[var(--color-border)]" aria-label="Weekly 보기">{([["report", "주간 작업", view.topics.length], ["learning", "기술 학습", view.learning.length]] as const).map(([key, label, count]) => <button key={key} onClick={() => onTabChange(key)} className={cn("-mb-px border-b-[3px] px-1 pb-3 text-[15px] font-semibold", tab === key ? "border-cyan-400 text-cyan-200" : "border-transparent text-[var(--color-text-muted)]")}>{label}<Count>{count}</Count></button>)}</nav>
    {tab === "report" ? <div className="space-y-7">
      <nav className="sticky top-0 z-10 flex flex-wrap gap-1 border-b border-[var(--color-border)] bg-[var(--color-background)] py-2" aria-label="주간 작업 목차">{sections.filter(([, , count]) => count).map(([id, label, count]) => <a key={id} href={`#weekly-${id}`} className="rounded-full px-3 py-1.5 text-[13px] text-[var(--color-text-muted)] hover:bg-cyan-400/10 hover:text-cyan-200">{label}<Count>{count}</Count></a>)}</nav>
      {view.lastWeekPlan.length > 0 && <SimpleSection id="plan" title="지난주 계획"><Bullets items={view.lastWeekPlan.map((item) => item.status ? `[${item.status}] ${item.text}` : item.text)} /></SimpleSection>}
      {view.topics.length > 0 && <section id="weekly-topics" className="scroll-mt-16 space-y-3"><h2 className="text-[16px] font-semibold">주제</h2><JumpTabs label="주제 바로가기" items={topicTabs} active={activeTopic} onSelect={(id) => jumpTo(id, setActiveTopic)} />{view.topics.map((topic, index) => <div id={topicTabs[index].id} key={`${index}-${topic.title}`} className="scroll-mt-14"><Topic topic={topic} /></div>)}</section>}
      {view.blocked.length > 0 && <SimpleSection id="blocked" title="막힌 것" warn><Bullets items={view.blocked} warn /></SimpleSection>}
      {view.nextWeek.length > 0 && <SimpleSection id="next" title="다음 주"><Bullets items={view.nextWeek} /></SimpleSection>}
    </div> : <div className="space-y-5">
      <section className="panel-card rounded-xl border p-5"><h2 className="mb-2 text-[13px] font-semibold text-[var(--color-text-muted)]">이번 주 배운 것</h2><Bullets items={view.learningSummary} /></section>
      {view.learning.length > 0 && <JumpTabs label="기술 학습 바로가기" items={learningTabs} active={activeLearning} onSelect={(id) => jumpTo(id, setActiveLearning)} />}
      <div className="space-y-4">{view.learning.map((item, index) => <div id={learningTabs[index].id} key={`${index}-${item.name}`} className="scroll-mt-14"><LearningCard item={item} /></div>)}</div>
    </div>}
  </div>;
}

function SimpleSection({ id, title, children, warn = false }: { id: string; title: string; children: React.ReactNode; warn?: boolean }) { return <section id={`weekly-${id}`} className="scroll-mt-16 space-y-2"><h2 className="text-[16px] font-semibold">{title}</h2><div className={cn("rounded-xl border p-4", warn ? "border-amber-400/25 bg-amber-400/5" : "panel-card")}>{children}</div></section>; }

const monthLabel = (date: string) => `${date.slice(0, 4)}년 ${Number(date.slice(5, 7))}월`;

/** 왼쪽 주차 타임라인. 달력과 목록을 하나로 합쳐, 고른 주를 오른쪽에서 페이지 이동 없이 읽는다. */
function WeekRail({ reports, selected, onSelect }: { reports: WeeklyReportSummary[]; selected: string; onSelect: (weekId: string) => void }) {
  const months = Object.entries(reports.reduce<Record<string, WeeklyReportSummary[]>>((groups, report) => { (groups[monthLabel(report.start)] ??= []).push(report); return groups; }, {}));
  return <nav aria-label="주차 목록" className="ck-scroll flex gap-3 overflow-x-auto xl:sticky xl:top-4 xl:max-h-[calc(100vh-7rem)] xl:flex-col xl:gap-4 xl:overflow-y-auto xl:overflow-x-hidden xl:pr-1">
    {months.map(([label, items]) => <div key={label} className="flex shrink-0 gap-1.5 xl:flex-col xl:gap-0.5">
      <p className="hidden px-3 pb-1 text-[11px] font-semibold text-slate-500 xl:block">{label}</p>
      {items.map((report) => {
        const active = report.weekId === selected;
        return <button key={report.weekId} type="button" aria-current={active ? "true" : undefined} aria-label={`${report.weekId} 주간 작업 리포트 열기`} onClick={() => onSelect(report.weekId)} className={cn(
          "group flex min-w-[220px] items-start gap-3 rounded-xl px-3 py-2.5 text-left outline-none transition-[background-color,transform] duration-300 hover:bg-white/[0.045] active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-cyan-300/60 xl:min-w-0 xl:w-full",
          active && "bg-[linear-gradient(100deg,rgba(34,211,238,.12),rgba(34,211,238,.035)_60%,rgba(99,102,241,.04))] shadow-[inset_2px_0_0_rgba(103,232,249,.75),inset_0_0_0_1px_rgba(103,232,249,.14)]",
        )}>
          <span className={cn("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", active ? "bg-cyan-300" : "bg-slate-600")} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2"><strong className={cn("font-mono text-[12.5px] font-semibold", active ? "text-white" : "text-slate-300")}>{report.weekId}</strong><span className="font-mono text-[10.5px] text-slate-500">{report.start.slice(5)}</span></span>
            <span className={cn("mt-1 block truncate text-[12px]", active ? "text-slate-200" : "text-slate-400")}>{report.headline[0] ?? "요약 없음"}</span>
            {report.counts && <span className="mt-0.5 block text-[11px] text-slate-500">주제 {report.counts.topics} · 기술 학습 {report.counts.learnings}</span>}
          </span>
        </button>;
      })}
    </div>)}
  </nav>;
}

/** 오른쪽 리더 머리. 고른 주의 요약과 항목 수를 오로라 위에 보여 준다. */
function WeekHero({ report }: { report: WeeklyReportSummary }) {
  const counts = report.counts;
  const stats: Array<[string, number | undefined]> = [["주제", counts?.topics], ["기술 학습", counts?.learnings], ["다음 주", counts?.nextWeek]];
  return <section aria-label={`${report.weekId} 요약`} className="aurora-card rounded-2xl border px-5 py-4">
    <header className="flex flex-wrap items-baseline justify-between gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><strong className="font-mono text-[17px] font-semibold text-white">{report.weekId}</strong><span className="font-mono text-[12px] text-slate-400">{report.start} — {report.end}</span></div>
      <span className="font-mono text-[11px] text-slate-500">생성 {report.generatedAt.slice(0, 10)}</span>
    </header>
    <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto]">
      <ul className="space-y-2">{report.headline.map((headline) => <li key={headline} className="flex gap-2.5 break-keep text-[14px] leading-[1.6] text-slate-100"><span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300" />{headline}</li>)}</ul>
      {counts && <dl className="grid grid-cols-3 gap-2 self-start">{stats.map(([label, value]) => <div key={label} className="min-w-[88px] rounded-xl border border-white/[0.08] bg-[rgba(7,12,22,0.55)] px-3 py-2.5 backdrop-blur-[6px]"><dt className="text-[11px] text-slate-400">{label}</dt><dd className="mt-1.5 font-mono text-[20px] font-semibold leading-none text-white">{value ?? 0}</dd></div>)}</dl>}
    </div>
  </section>;
}

export function WeeklyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const routeState = readWeeklyRouteState(searchParams);
  const [reports, setReports] = useState<WeeklyReportSummary[] | null>(null); const [detail, setDetail] = useState<WeeklyReportDetail | null>(null);
  const navigate = useNavigate();
  const [scheduleOff, setScheduleOff] = useState(false);
  // 주를 고르지 않았으면 가장 최근 주를 연다.
  const selected = routeState.weekId ?? reports?.[0]?.weekId ?? null;
  useEffect(() => { listWeeklyReports().then(setReports).catch(() => setReports([])); }, []);
  useEffect(() => { getWeeklySettings().then((settings) => setScheduleOff(!settings.enabled)).catch(() => setScheduleOff(false)); }, []);
  useEffect(() => { if (!selected) return setDetail(null); let cancelled = false; setDetail(null); getWeeklyReport(selected).then((value) => !cancelled && setDetail(value)).catch(() => !cancelled && setDetail(null)); return () => { cancelled = true; }; }, [selected]);
  const selectedReport = reports?.find((report) => report.weekId === selected);
  const readerRef = useRef<HTMLElement>(null);
  const select = (weekId: string) => {
    setSearchParams(writeWeeklyRouteState(searchParams, weekId, "report"), { replace: true });
    // 아래로 읽던 중 다른 주를 고르면 새 주의 맨 위부터 보여 준다.
    if ((readerRef.current?.getBoundingClientRect().top ?? 0) < 0) readerRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  return <div className="w-full space-y-5"><PageHeading eyebrow="WEEKLY REVIEW" title="주간 작업 리포트" description="한 주의 작업 결과와 기술 학습을 기록하고 다시 확인합니다." />{scheduleOff && <NoticeBar title="주간 리포트 자동 정리가 꺼져 있습니다." detail="켜면 정한 요일과 시각에 리포트를 만들고, 꺼져 있는 동안은 /sugo:weekly로 직접 만들 수 있습니다." actionLabel="주간 리포트 설정 열기" onAction={() => navigate("/preferences?tab=weekly")} />}
    {reports !== null && reports.length === 0 ? <p className="text-[13px] text-slate-400">보고서가 없습니다.</p> : reports && selected && <div className="grid items-start gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <WeekRail reports={reports} selected={selected} onSelect={select} />
      <main ref={readerRef} className="min-w-0 scroll-mt-4 space-y-6">
        {selectedReport && <WeekHero report={selectedReport} />}
        {detail ? <ReportBody detail={detail} tab={routeState.view} onTabChange={(view) => setSearchParams(writeWeeklyRouteState(searchParams, selected, view), { replace: true })} /> : <div className="h-28 animate-pulse rounded-xl bg-[var(--color-surface)]" />}
      </main>
    </div>}
  </div>;
}
