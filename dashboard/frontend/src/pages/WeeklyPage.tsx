import { useEffect, useMemo, useState } from "react";
import { getWeeklyReport, listWeeklyReports, type WeeklyReportDetail, type WeeklyReportSummary } from "../api/weeklyApi.js";
import { toWeeklyView, type WeeklyLearningView, type WeeklyTopicView } from "../lib/weeklyPresentation.js";
import { cn } from "../lib/utils.js";

function Bullets({ items, warn = false }: { items: string[]; warn?: boolean }) {
  return <ul className="space-y-1.5 text-[15px] leading-6 text-[var(--color-text)]">{items.map((item, index) => <li key={`${index}-${item}`} className="flex gap-2.5"><span className={cn("mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full", warn ? "bg-amber-400" : "bg-cyan-400/70")} /><span className="min-w-0 break-words">{item}</span></li>)}</ul>;
}

function Count({ children }: { children: number }) { return <span className="ml-1.5 font-mono text-[11px] opacity-60">{children}</span>; }

function Topic({ topic }: { topic: WeeklyTopicView }) {
  const facts: Array<[string, string[]]> = [["상황", topic.context ? [topic.context] : []], ["목적", topic.goal ? [topic.goal] : []], ["한 일", topic.done], ["검증", topic.results]];
  return <article className="overflow-hidden rounded-xl border border-[var(--color-border)] border-l-4 border-l-cyan-400 bg-[var(--color-surface)]">
    <header className="flex flex-wrap items-start gap-2 border-b border-[var(--color-border)] px-5 py-4"><div className="min-w-0 flex-1"><h3 className="text-[17px] font-semibold text-[var(--color-text-bright)]">{topic.title}</h3>{topic.oneLine && <p className="mt-1 text-sm text-[var(--color-text-muted)]">{topic.oneLine}</p>}</div>{topic.category && <Tag>{topic.category}</Tag>}{topic.workspace && <Tag mono>{topic.workspace}</Tag>}</header>
    <div className="grid gap-x-8 gap-y-4 px-5 py-4 xl:grid-cols-2">{facts.map(([label, items]) => items.length ? <section key={label}><Label>{label}</Label><Bullets items={items} /></section> : null)}</div>
    {topic.todo.length > 0 && <div className="mx-5 mb-5 rounded-lg border border-amber-400/25 bg-amber-400/5 px-4 py-3"><Label warn>남은 일</Label><Bullets items={topic.todo} warn /></div>}
  </article>;
}

function Label({ children, warn = false }: { children: React.ReactNode; warn?: boolean }) { return <p className={cn("mb-1.5 text-xs font-semibold", warn ? "text-amber-300" : "text-[var(--color-text-muted)]")}>{children}</p>; }
function Tag({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) { return <span className={cn("rounded-full bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-200", mono && "font-mono")}>{children}</span>; }

function LearningCard({ item }: { item: WeeklyLearningView }) {
  const panels: Array<[string, string[], string]> = [["핵심 개념", item.keyPoints, ""], ["동작 원리", item.howItWorks, ""], ["이번 작업에서의 예", item.example, "bg-[var(--color-bg)]"], ["쓸 때", item.whenToUse, ""], ["피할 때", item.whenNotToUse, ""], ["흔한 함정", item.pitfalls, "border-amber-400/25 bg-amber-400/5"]];
  const rationale = [...item.rationaleRecorded, ...item.rationaleUnverified.map((value) => `근거 기록 없음 · ${value}`), ...(item.rationaleGeneral ? [`일반론 · ${item.rationaleGeneral}`] : [])];
  return <article className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
    <header className="flex flex-wrap items-center gap-2 px-5 pt-5"><h3 className="mr-1 text-lg font-semibold text-[var(--color-text-bright)]">{item.name}</h3>{item.category && <Tag>{item.category}</Tag>}{item.level && <span className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]">{item.level}</span>}</header>
    {item.definition && <p className="mx-5 mt-4 border-l-[3px] border-cyan-400 bg-cyan-400/[0.06] px-4 py-3 text-[16px] font-semibold leading-7 text-[var(--color-text-bright)]">{item.definition}</p>}
    <div className="grid gap-3 p-5 lg:grid-cols-2">{panels.map(([label, values, tone]) => values.length ? <section key={label} className={cn("rounded-lg border border-[var(--color-border)] px-4 py-3", tone)}><Label>{label}</Label><Bullets items={values} warn={label === "흔한 함정"} /></section> : null)}</div>
    {item.alternatives.length > 0 && <section className="mx-5 mb-5 overflow-x-auto"><Label>대체재 비교</Label><table className="w-full min-w-[660px] text-left text-sm"><thead className="bg-[var(--color-bg)] text-xs text-[var(--color-text-muted)]"><tr>{["대체재", "장점", "단점", "더 맞는 상황"].map((head) => <th key={head} className="border-b border-[var(--color-border)] px-3 py-2">{head}</th>)}</tr></thead><tbody>{item.alternatives.map((alt) => <tr key={alt.name} className="border-b border-[var(--color-border)] last:border-0"><td className="px-3 py-2 font-semibold">{alt.name}</td><td className="px-3 py-2">{alt.pros}</td><td className="px-3 py-2">{alt.cons}</td><td className="px-3 py-2">{alt.when}</td></tr>)}</tbody></table></section>}
    {(item.complements.length > 0 || rationale.length > 0 || item.quiz.length > 0 || item.keywords.length > 0) && <div className="grid gap-5 border-t border-[var(--color-border)] px-5 py-4 lg:grid-cols-[1fr_.75fr]"><div className="space-y-4">{item.complements.length > 0 && <section><Label>보완재</Label><Bullets items={item.complements.map((value) => `${value.name} — ${value.why}`)} /></section>}{rationale.length > 0 && <section><Label>선택 근거</Label><Bullets items={rationale} /></section>}</div><div className="space-y-3">{item.quiz.map((quiz) => <details key={quiz.question} className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"><summary className="cursor-pointer font-semibold">Q. {quiz.question}</summary><p className="mt-2">{quiz.answer}</p></details>)}{item.keywords.length > 0 && <div className="flex flex-wrap gap-1.5">{item.keywords.map((keyword) => <Tag key={keyword}>{keyword}</Tag>)}</div>}</div></div>}
  </article>;
}

function ReportBody({ detail }: { detail: WeeklyReportDetail }) {
  const view = useMemo(() => toWeeklyView(detail.report), [detail]);
  const [tab, setTab] = useState<"report" | "learning">("report");
  const [filter, setFilter] = useState("all");
  const visible = filter === "all" ? view.learning : view.learning.filter((item) => item.relatedTopics.includes(filter));
  const sections = [["plan", "지난주 계획", view.lastWeekPlan.length], ["topics", "주제", view.topics.length], ["blocked", "막힌 것", view.blocked.length], ["next", "다음 주", view.nextWeek.length]] as const;
  const filters = ["all", ...view.topics.map((topic) => topic.title).filter((title) => view.learning.some((item) => item.relatedTopics.includes(title)))];
  return <div>
    <nav className="mb-5 flex gap-8 border-b border-[var(--color-border)]" aria-label="Weekly 보기">{([["report", "주간 작업", view.topics.length], ["learning", "기술 학습", view.learning.length]] as const).map(([key, label, count]) => <button key={key} onClick={() => setTab(key)} className={cn("-mb-px border-b-[3px] px-1 pb-3 text-base font-semibold", tab === key ? "border-cyan-400 text-cyan-200" : "border-transparent text-[var(--color-text-muted)]")}>{label}<Count>{count}</Count></button>)}</nav>
    {tab === "report" ? <div className="space-y-7">
      {view.headline.length > 0 && <ul className="grid gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4">{view.headline.map((item) => <li key={item} className="flex gap-3 text-[16px] font-medium leading-7"><span className="mt-2.5 h-2 w-2 shrink-0 rounded-sm bg-cyan-400" />{item}</li>)}</ul>}
      <nav className="sticky top-0 z-10 flex flex-wrap gap-1 border-b border-[var(--color-border)] bg-[var(--color-bg)] py-2" aria-label="주간 작업 목차">{sections.filter(([, , count]) => count).map(([id, label, count]) => <a key={id} href={`#weekly-${id}`} className="rounded-full px-3 py-1.5 text-sm text-[var(--color-text-muted)] hover:bg-cyan-400/10 hover:text-cyan-200">{label}<Count>{count}</Count></a>)}</nav>
      {view.lastWeekPlan.length > 0 && <SimpleSection id="plan" title="지난주 계획"><Bullets items={view.lastWeekPlan.map((item) => item.status ? `[${item.status}] ${item.text}` : item.text)} /></SimpleSection>}
      {view.topics.length > 0 && <section id="weekly-topics" className="scroll-mt-16 space-y-3"><h2 className="text-lg font-semibold">주제</h2>{view.topics.map((topic, index) => <Topic key={`${index}-${topic.title}`} topic={topic} />)}</section>}
      {view.blocked.length > 0 && <SimpleSection id="blocked" title="막힌 것" warn><Bullets items={view.blocked} warn /></SimpleSection>}
      {view.nextWeek.length > 0 && <SimpleSection id="next" title="다음 주"><Bullets items={view.nextWeek} /></SimpleSection>}
    </div> : <div className="space-y-5">
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"><h2 className="mb-2 text-sm font-semibold text-[var(--color-text-muted)]">이번 주 배운 것</h2><Bullets items={view.learningSummary} /><div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-4">{view.learning.map((item) => <Tag key={item.name}>{item.name}</Tag>)}</div></section>
      <nav className="sticky top-0 z-10 flex flex-wrap gap-1 border-b border-[var(--color-border)] bg-[var(--color-bg)] py-2" aria-label="주제별 기술 필터">{filters.map((value) => { const count = value === "all" ? view.learning.length : view.learning.filter((item) => item.relatedTopics.includes(value)).length; return <button key={value} onClick={() => setFilter(value)} className={cn("rounded-full px-3 py-1.5 text-sm", filter === value ? "bg-cyan-400/15 font-semibold text-cyan-200" : "text-[var(--color-text-muted)]")}>{value === "all" ? "전체" : value}<Count>{count}</Count></button>; })}</nav>
      <div className="space-y-4">{visible.map((item) => <LearningCard key={item.name} item={item} />)}</div>
    </div>}
  </div>;
}

function SimpleSection({ id, title, children, warn = false }: { id: string; title: string; children: React.ReactNode; warn?: boolean }) { return <section id={`weekly-${id}`} className="scroll-mt-16 space-y-2"><h2 className="text-lg font-semibold">{title}</h2><div className={cn("rounded-xl border p-4", warn ? "border-amber-400/25 bg-amber-400/5" : "border-[var(--color-border)] bg-[var(--color-surface)]")}>{children}</div></section>; }

export function WeeklyPage() {
  const [reports, setReports] = useState<WeeklyReportSummary[] | null>(null); const [selected, setSelected] = useState<string | null>(null); const [detail, setDetail] = useState<WeeklyReportDetail | null>(null);
  useEffect(() => { listWeeklyReports().then((list) => { setReports(list); setSelected(list[0]?.weekId ?? null); }).catch(() => setReports([])); }, []);
  useEffect(() => { if (!selected) return setDetail(null); let cancelled = false; setDetail(null); getWeeklyReport(selected).then((value) => !cancelled && setDetail(value)).catch(() => !cancelled && setDetail(null)); return () => { cancelled = true; }; }, [selected]);
  const selectedReport = reports?.find((report) => report.weekId === selected);
  return <div className="space-y-5"><header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold text-[var(--color-text-bright)]">Weekly</h1><p className="mt-1 text-sm text-[var(--color-text-muted)]">한 주의 작업과 그 과정에서 익힌 기술을 함께 봅니다.</p></div>{selectedReport && <p className="font-mono text-sm text-[var(--color-text-muted)]">{selectedReport.start} — {selectedReport.end}</p>}</header>
    {reports !== null && reports.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">보고서가 없습니다.</p> : <div className="grid gap-6 md:grid-cols-[210px_minmax(0,1fr)]"><nav aria-label="주간 보고서 목록" className="flex gap-2 overflow-x-auto pb-2 md:block md:space-y-1">{(reports ?? []).map((report) => <button key={report.weekId} onClick={() => setSelected(report.weekId)} aria-pressed={selected === report.weekId} className={cn("min-w-44 rounded-lg border-l-2 px-3 py-2.5 text-left md:block md:w-full", selected === report.weekId ? "border-cyan-400 bg-cyan-400/10 text-cyan-100" : "border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]")}><span className="block text-sm font-semibold">{report.weekId}</span><span className="block font-mono text-[11px] opacity-70">{report.start} ~ {report.end}</span></button>)}</nav><main className="min-w-0">{detail ? <ReportBody detail={detail} /> : selected && <div className="h-28 animate-pulse rounded-xl bg-[var(--color-surface)]" />}</main></div>}
  </div>;
}
