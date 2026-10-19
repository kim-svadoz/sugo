import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { getWeeklyReport, listWeeklyReports, type WeeklyReportDetail, type WeeklyReportSummary } from "../api/weeklyApi.js";
import { toWeeklyView, type WeeklyLearningView, type WeeklyTopicView } from "../lib/weeklyPresentation.js";
import { buildWeeklyCalendar } from "../lib/weeklyCalendar.js";
import { cn } from "../lib/utils.js";
import { readWeeklyRouteState, writeWeeklyRouteState, type WeeklyDetailView } from "../lib/weeklyRouteState.js";

function Bullets({ items, warn = false }: { items: string[]; warn?: boolean }) {
  return <ul className="space-y-1.5 text-[15px] leading-6 text-[var(--color-text)]">{items.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2.5"><span className={cn("mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full", warn ? "bg-amber-400" : "bg-cyan-400/70")} /><span className="min-w-0 break-words">{item}</span></li>)}</ul>;
}

function Count({ children }: { children: number }) { return <span className="ml-1.5 font-mono text-[11px] opacity-60">{children}</span>; }

function Topic({ topic }: { topic: WeeklyTopicView }) {
  const facts: Array<[string, string[]]> = [["상황", topic.context ? [topic.context] : []], ["목적", topic.goal ? [topic.goal] : []], ["한 일", topic.done], ["검증", topic.results]];
  return <article className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
    <header className="border-b border-[var(--color-border)] px-5 py-4"><div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-bold tracking-tight text-cyan-100">{topic.title}</h3>{topic.category && <CategoryTag category={topic.category} />}{topic.workspace && <Tag mono>{topic.workspace}</Tag>}</div>{topic.oneLine && <p className="mt-2 max-w-4xl text-[15px] font-medium leading-6 text-slate-300">{topic.oneLine}</p>}</header>
    <div className="grid gap-x-8 gap-y-5 px-5 py-5 xl:grid-cols-2">{facts.map(([label, items]) => items.length ? <section key={label}><Label accent>{label}</Label><Bullets items={items} /></section> : null)}</div>
    {topic.todo.length > 0 && <section className="mx-5 mb-5 overflow-hidden rounded-lg border border-amber-400/30 bg-amber-400/[0.07]"><h4 className="border-b border-amber-400/20 px-4 py-2 text-sm font-bold text-amber-200">남은 일 <Count>{topic.todo.length}</Count></h4><ul className="divide-y divide-amber-400/10">{topic.todo.map((item) => <li key={`${item.kind}-${item.text}`} className="flex items-start gap-3 px-4 py-3 text-[15px] leading-6"><span className="mt-0.5 shrink-0 rounded-full bg-amber-300/15 px-2 py-0.5 text-[11px] font-bold text-amber-200">{item.kind || "작업"}</span><span className="text-slate-200">{item.text}</span></li>)}</ul></section>}
  </article>;
}

function Label({ children, warn = false, accent = false }: { children: React.ReactNode; warn?: boolean; accent?: boolean }) { return <p className={cn("mb-2 text-xs font-bold uppercase tracking-[0.08em]", warn ? "text-amber-300" : accent ? "text-cyan-300" : "text-slate-400")}>{children}</p>; }
function Tag({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) { return <span className={cn("rounded-full bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-200", mono && "font-mono")}>{children}</span>; }
function CategoryTag({ category }: { category: string }) {
  const tone = ({ 기능: "bg-cyan-400/15 text-cyan-200", 수정: "bg-violet-400/15 text-violet-200", 개선: "bg-emerald-400/15 text-emerald-200", 도구: "bg-blue-400/15 text-blue-200", 운영: "bg-amber-400/15 text-amber-200" } as Record<string, string>)[category] ?? "bg-slate-400/15 text-slate-200";
  return <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", tone)}>{category}</span>;
}

function JumpTabs({ label, items, active, onSelect }: { label: string; items: Array<{ id: string; label: string }>; active: string; onSelect: (id: string) => void }) {
  return <nav aria-label={label} className="sticky top-0 z-20 -mx-1 overflow-x-auto border-y border-[var(--color-border)] bg-[var(--color-background)]/95 px-1 py-2 backdrop-blur">
    <div className="flex min-w-max gap-1">{items.map((item, index) => <button key={item.id} type="button" aria-current={active === item.id ? "true" : undefined} onClick={() => onSelect(item.id)} className={cn("max-w-[280px] rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors", active === item.id ? "bg-cyan-400/15 text-cyan-100 ring-1 ring-inset ring-cyan-400/35" : "text-[var(--color-text-muted)] hover:bg-white/[0.04] hover:text-[var(--color-text)]")}><span className="mr-2 font-mono text-[11px] opacity-50">{String(index + 1).padStart(2, "0")}</span><span className="inline-block max-w-[220px] truncate align-bottom">{item.label}</span></button>)}</div>
  </nav>;
}

function LearningCard({ item }: { item: WeeklyLearningView }) {
  const panels: Array<[string, string[], string]> = [["핵심 개념", item.keyPoints, ""], ["동작 원리", item.howItWorks, ""], ["이번 작업에서의 예", item.example, "bg-[var(--color-background)]"], ["쓸 때", item.whenToUse, ""], ["피할 때", item.whenNotToUse, ""], ["흔한 함정", item.pitfalls, "border-amber-400/25 bg-amber-400/5"]];
  const rationale = [...item.rationaleRecorded, ...item.rationaleUnverified.map((value) => `근거 기록 없음 · ${value}`), ...(item.rationaleGeneral ? [`일반론 · ${item.rationaleGeneral}`] : [])];
  return <article className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
    <header className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] px-5 py-4"><h3 className="mr-1 text-xl font-bold tracking-tight text-cyan-100">{item.name}</h3>{item.category && <Tag>{item.category}</Tag>}{item.level && <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 text-xs font-semibold text-violet-200">{item.level}</span>}{item.relatedTopics.length > 0 && <p className="mt-1 flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-400"><span className="font-semibold text-slate-500">쓰인 작업</span>{item.relatedTopics.map((topic) => <span key={topic} className="rounded-md bg-slate-400/10 px-2 py-0.5 text-slate-300">{topic}</span>)}</p>}</header>
    {item.definition && <p className="mx-5 mt-4 border-l-[3px] border-cyan-400 bg-cyan-400/[0.06] px-4 py-3 text-[16px] font-semibold leading-7 text-[var(--color-text-bright)]">{item.definition}</p>}
    <div className="grid gap-3 p-5 lg:grid-cols-2">{panels.map(([label, values, tone]) => values.length ? <section key={label} className={cn("rounded-lg border border-[var(--color-border)] px-4 py-3", tone)}><Label accent={label !== "흔한 함정"} warn={label === "흔한 함정"}>{label}</Label><Bullets items={values} warn={label === "흔한 함정"} /></section> : null)}</div>
    {item.alternatives.length > 0 && <section className="mx-5 mb-5 overflow-x-auto"><Label>대체재 비교</Label><table className="w-full min-w-[660px] text-left text-sm"><thead className="bg-[var(--color-background)] text-xs text-[var(--color-text-muted)]"><tr>{["대체재", "장점", "단점", "더 맞는 상황"].map((head) => <th key={head} className="border-b border-[var(--color-border)] px-3 py-2">{head}</th>)}</tr></thead><tbody>{item.alternatives.map((alt) => <tr key={alt.name} className="border-b border-[var(--color-border)] last:border-0"><td className="px-3 py-2 font-semibold">{alt.name}</td><td className="px-3 py-2">{alt.pros}</td><td className="px-3 py-2">{alt.cons}</td><td className="px-3 py-2">{alt.when}</td></tr>)}</tbody></table></section>}
    {(item.complements.length > 0 || rationale.length > 0 || item.quiz.length > 0 || item.keywords.length > 0) && <div className="grid gap-5 border-t border-[var(--color-border)] px-5 py-4 lg:grid-cols-[1fr_.75fr]"><div className="space-y-4">{item.complements.length > 0 && <section><Label>보완재</Label><Bullets items={item.complements.map((value) => `${value.name} — ${value.why}`)} /></section>}{rationale.length > 0 && <section><Label>선택 근거</Label><Bullets items={rationale} /></section>}</div><div className="space-y-3">{item.quiz.map((quiz) => <details key={quiz.question} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"><summary className="cursor-pointer font-semibold">Q. {quiz.question}</summary><p className="mt-2">{quiz.answer}</p></details>)}{item.keywords.length > 0 && <div className="flex flex-wrap gap-1.5">{item.keywords.map((keyword) => <Tag key={keyword}>{keyword}</Tag>)}</div>}</div></div>}
  </article>;
}

function ReportBody({ detail, tab, onTabChange }: { detail: WeeklyReportDetail; tab: WeeklyDetailView; onTabChange: (tab: WeeklyDetailView) => void }) {
  const view = useMemo(() => toWeeklyView(detail.report), [detail]);
  const topicTabs = useMemo(() => view.topics.map((topic, index) => ({ id: `weekly-topic-${index}`, label: topic.title })), [view.topics]);
  const learningTabs = useMemo(() => view.learning.map((item, index) => ({ id: `weekly-learning-${index}`, label: item.name })), [view.learning]);
  const [activeTopic, setActiveTopic] = useState(topicTabs[0]?.id ?? "");
  const [activeLearning, setActiveLearning] = useState(learningTabs[0]?.id ?? "");
  const jumpTo = (id: string, setActive: (id: string) => void) => { setActive(id); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const sections = [["plan", "지난주 계획", view.lastWeekPlan.length], ["topics", "주제", view.topics.length], ["blocked", "막힌 것", view.blocked.length], ["next", "다음 주", view.nextWeek.length]] as const;
  return <div>
    <nav className="mb-5 flex gap-8 border-b border-[var(--color-border)]" aria-label="Weekly 보기">{([["report", "주간 작업", view.topics.length], ["learning", "기술 학습", view.learning.length]] as const).map(([key, label, count]) => <button key={key} onClick={() => onTabChange(key)} className={cn("-mb-px border-b-[3px] px-1 pb-3 text-base font-semibold", tab === key ? "border-cyan-400 text-cyan-200" : "border-transparent text-[var(--color-text-muted)]")}>{label}<Count>{count}</Count></button>)}</nav>
    {tab === "report" ? <div className="space-y-7">
      {view.headline.length > 0 && <ul className="grid gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">{view.headline.map((item) => <li key={item} className="flex gap-3 text-[16px] font-medium leading-7"><span className="mt-2.5 h-2 w-2 shrink-0 rounded-sm bg-cyan-400" />{item}</li>)}</ul>}
      <nav className="sticky top-0 z-10 flex flex-wrap gap-1 border-b border-[var(--color-border)] bg-[var(--color-background)] py-2" aria-label="주간 작업 목차">{sections.filter(([, , count]) => count).map(([id, label, count]) => <a key={id} href={`#weekly-${id}`} className="rounded-full px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-cyan-400/10 hover:text-cyan-200">{label}<Count>{count}</Count></a>)}</nav>
      {view.lastWeekPlan.length > 0 && <SimpleSection id="plan" title="지난주 계획"><Bullets items={view.lastWeekPlan.map((item) => item.status ? `[${item.status}] ${item.text}` : item.text)} /></SimpleSection>}
      {view.topics.length > 0 && <section id="weekly-topics" className="scroll-mt-16 space-y-3"><h2 className="text-lg font-semibold">주제</h2><JumpTabs label="주제 바로가기" items={topicTabs} active={activeTopic} onSelect={(id) => jumpTo(id, setActiveTopic)} />{view.topics.map((topic, index) => <div id={topicTabs[index].id} key={`${index}-${topic.title}`} className="scroll-mt-14"><Topic topic={topic} /></div>)}</section>}
      {view.blocked.length > 0 && <SimpleSection id="blocked" title="막힌 것" warn><Bullets items={view.blocked} warn /></SimpleSection>}
      {view.nextWeek.length > 0 && <SimpleSection id="next" title="다음 주"><Bullets items={view.nextWeek} /></SimpleSection>}
    </div> : <div className="space-y-5">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><h2 className="mb-2 text-sm font-semibold text-[var(--color-text-muted)]">이번 주 배운 것</h2><Bullets items={view.learningSummary} /></section>
      {view.learning.length > 0 && <JumpTabs label="기술 학습 바로가기" items={learningTabs} active={activeLearning} onSelect={(id) => jumpTo(id, setActiveLearning)} />}
      <div className="space-y-4">{view.learning.map((item, index) => <div id={learningTabs[index].id} key={`${index}-${item.name}`} className="scroll-mt-14"><LearningCard item={item} /></div>)}</div>
    </div>}
  </div>;
}

function SimpleSection({ id, title, children, warn = false }: { id: string; title: string; children: React.ReactNode; warn?: boolean }) { return <section id={`weekly-${id}`} className="scroll-mt-16 space-y-2"><h2 className="text-lg font-semibold">{title}</h2><div className={cn("rounded-xl border p-4", warn ? "border-amber-400/25 bg-amber-400/5" : "border-[var(--color-border)] bg-[var(--color-surface)]")}>{children}</div></section>; }

function WeeklyIndex({ reports, onOpen }: { reports: WeeklyReportSummary[]; onOpen: (weekId: string) => void }) {
  const months = useMemo(() => buildWeeklyCalendar(reports), [reports]);
  const [monthIndex, setMonthIndex] = useState(Math.max(0, months.length - 1));
  const [hovered, setHovered] = useState<string | null>(null);
  const month = months[monthIndex];
  const weekdays = ["월", "화", "수", "목", "금", "토", "일"];
  const moveHighlight = (weekId: string | null) => {
    setHovered(weekId);
    if (!weekId) return;
    const next = months.findIndex((value) => value.weeks.some((week) => week.weekId === weekId && week.days[0]?.inMonth));
    if (next >= 0) setMonthIndex(next);
  };
  return <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
    <section className="space-y-3" aria-label="주간 작업 목록">{reports.map((report) => <button key={report.weekId} onMouseEnter={() => moveHighlight(report.weekId)} onMouseLeave={() => setHovered(null)} onFocus={() => moveHighlight(report.weekId)} onBlur={() => setHovered(null)} onClick={() => onOpen(report.weekId)} className={cn("block w-full rounded-xl border bg-[var(--color-surface)] px-5 py-4 text-left transition", hovered === report.weekId ? "border-cyan-400 ring-2 ring-cyan-400/40" : "border-[var(--color-border)] hover:border-cyan-400/60")}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><strong className="font-mono text-lg text-cyan-100">{report.weekId}</strong><span className="font-mono text-xs text-slate-400">{report.start} — {report.end}</span></div>
      <div className="mt-3 space-y-1">{report.headline.slice(0, 3).map((headline) => <p key={headline} className="truncate text-[15px] leading-6 text-slate-200">{headline}</p>)}</div>
      <span className="mt-3 inline-block text-xs font-semibold text-cyan-300">보고서 열기 →</span>
    </button>)}</section>
    {month && <aside className="sticky top-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4" aria-label="주간 보고서 달력">
      <header className="mb-3 flex items-center justify-between"><button aria-label="이전 달" disabled={monthIndex === 0} onClick={() => setMonthIndex((value) => value - 1)} className="h-8 w-8 rounded-md border border-[var(--color-border)] text-slate-300 disabled:opacity-30">‹</button><strong className="text-base text-slate-100">{month.label}</strong><button aria-label="다음 달" disabled={monthIndex === months.length - 1} onClick={() => setMonthIndex((value) => value + 1)} className="h-8 w-8 rounded-md border border-[var(--color-border)] text-slate-300 disabled:opacity-30">›</button></header>
      <table className="w-full table-fixed border-separate border-spacing-y-1 text-center font-mono text-xs"><thead><tr><th className="w-9" />{weekdays.map((day) => <th key={day} className="pb-1 font-sans font-semibold text-slate-500">{day}</th>)}</tr></thead><tbody>{month.weeks.map((week) => <tr key={`${month.key}-${week.weekNumber}`} onMouseEnter={() => week.weekId && setHovered(week.weekId)} onMouseLeave={() => setHovered(null)} onClick={() => week.weekId && onOpen(week.weekId)} className={cn(week.weekId && "cursor-pointer", hovered === week.weekId && week.weekId ? "bg-cyan-400 text-slate-950" : week.weekId ? "bg-cyan-400/10 text-cyan-100" : "text-slate-500")}><td className="rounded-l-md py-2 text-left text-[10px]">W{String(week.weekNumber).padStart(2, "0")}</td>{week.days.map((day, index) => <td key={index} className={cn("py-2", !day.inMonth && "opacity-30", day.weekend && hovered !== week.weekId && "text-slate-500", index === 6 && "rounded-r-md")}>{day.day}</td>)}</tr>)}</tbody></table>
      <div className="mt-3 flex gap-4 border-t border-[var(--color-border)] pt-3 text-xs text-slate-400"><span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-cyan-400/20" />보고서 있음</span><span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm bg-cyan-400" />선택한 주</span></div>
    </aside>}
  </div>;
}

export function WeeklyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const routeState = readWeeklyRouteState(searchParams);
  const selected = routeState.weekId;
  const [reports, setReports] = useState<WeeklyReportSummary[] | null>(null); const [detail, setDetail] = useState<WeeklyReportDetail | null>(null);
  useEffect(() => { listWeeklyReports().then(setReports).catch(() => setReports([])); }, []);
  useEffect(() => { if (!selected) return setDetail(null); let cancelled = false; setDetail(null); getWeeklyReport(selected).then((value) => !cancelled && setDetail(value)).catch(() => !cancelled && setDetail(null)); return () => { cancelled = true; }; }, [selected]);
  const selectedReport = reports?.find((report) => report.weekId === selected);
  return <div className="space-y-6">{selected ? <>
    <header className="flex flex-wrap items-end justify-between gap-3"><div><button onClick={() => setSearchParams(writeWeeklyRouteState(searchParams, null, "report"), { replace: true })} className="mb-3 text-sm font-semibold text-cyan-300 hover:text-cyan-100">← 전체 주 목록</button><h1 className="text-2xl font-bold text-slate-100">주간 작업</h1></div>{selectedReport && <p className="font-mono text-sm text-slate-400">{selectedReport.weekId} · {selectedReport.start} — {selectedReport.end}</p>}</header>
    <main>{detail ? <ReportBody detail={detail} tab={routeState.view} onTabChange={(view) => setSearchParams(writeWeeklyRouteState(searchParams, selected, view), { replace: true })} /> : <div className="h-28 animate-pulse rounded-xl bg-[var(--color-surface)]" />}</main>
  </> : <><header><h1 className="text-2xl font-bold text-slate-100">Weekly</h1><p className="mt-1 text-sm text-slate-400">한 주를 선택하면 작업 내용과 기술 학습을 확인할 수 있습니다.</p></header>
    {reports !== null && reports.length === 0 ? <p className="text-sm text-slate-400">보고서가 없습니다.</p> : reports && <WeeklyIndex reports={reports} onOpen={(weekId) => setSearchParams(writeWeeklyRouteState(searchParams, weekId, "report"), { replace: true })} />}
  </>}
  </div>;
}
