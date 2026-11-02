import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getWeeklyReport, getWeeklySettings, listWeeklyReports, type WeeklyReportDetail, type WeeklyReportSummary } from "../api/weeklyApi.js";
import { toWeeklyView, type WeeklyLearningView, type WeeklyTopicView } from "../lib/weeklyPresentation.js";
import { cn } from "../lib/utils.js";
import { PageHeading } from "../components/PageHeading.js";
import { NoticeBar } from "../components/NoticeBar.js";
import { readWeeklyRouteState, writeWeeklyRouteState, type WeeklyDetailView } from "../lib/weeklyRouteState.js";
import { selectWeeklySection } from "../lib/weeklyScrollSpy.js";
import { ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";

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

/* 본문은 개발자에게 익숙한 마크다운 미리보기처럼 그린다: 한 단 문서, ## 제목 아래 구분선, 일반 목록, 왼쪽 선 강조 상자. */
const H2 = "mb-4 border-b border-white/[0.08] pb-2 text-[16px] font-semibold text-slate-100";
const SECTION = "mt-10 scroll-mt-16 first:mt-0";
const H3 = "text-[15px] font-semibold text-cyan-100";

function Bullets({ items }: { items: string[] }) {
  return <ul className="list-disc space-y-1.5 pl-5 text-[14px] leading-[1.75] text-slate-300 marker:text-slate-500">{items.map((item, index) => <li key={`${index}-${item}`} className="break-words pl-1">{item}</li>)}</ul>;
}

function Count({ children }: { children: number }) { return <span className="ml-1.5 font-mono text-[11px] text-slate-500">{children}</span>; }

/** GitHub 알림 상자처럼 왼쪽 선만 둔 강조 상자. */
function Callout({ title, tone = "warn", children }: { title: string; tone?: "warn" | "note"; children: React.ReactNode }) {
  return <div className={cn("rounded-r-md border-l-[3px] px-4 py-3", tone === "warn" ? "border-amber-400/70 bg-amber-400/[0.045]" : "border-cyan-400/60 bg-cyan-400/[0.04]")}>
    <p className={cn("mb-1.5 text-[12px] font-semibold", tone === "warn" ? "text-amber-200" : "text-cyan-200")}>{title}</p>
    {children}
  </div>;
}

function Chip({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) { return <span className={cn("rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-slate-300", mono && "font-mono")}>{children}</span>; }

function Field({ label, items }: { label: string; items: string[] }) {
  return items.length ? <div><h4 className="mb-1 text-[12.5px] font-semibold text-slate-400">{label}</h4><Bullets items={items} /></div> : null;
}

function Topic({ topic }: { topic: WeeklyTopicView }) {
  return <article className="space-y-4">
    <header>
      <div className="flex flex-wrap items-center gap-2"><h3 className={H3}>{topic.title}</h3>{topic.category && <Chip>{topic.category}</Chip>}{topic.workspace && <Chip mono>{topic.workspace}</Chip>}</div>
      {topic.oneLine && <p className="mt-1.5 text-[14px] leading-[1.7] text-slate-400">{topic.oneLine}</p>}
    </header>
    <div className="grid gap-x-8 gap-y-4 xl:grid-cols-2">
      <Field label="상황" items={topic.context ? [topic.context] : []} />
      <Field label="목적" items={topic.goal ? [topic.goal] : []} />
      <Field label="한 일" items={topic.done} />
      <Field label="검증" items={topic.results} />
    </div>
    {topic.todo.length > 0 && <Callout title={`남은 일 ${topic.todo.length}`}><ul className="space-y-1 text-[14px] leading-[1.7] text-slate-300">{topic.todo.map((item) => <li key={`${item.kind}-${item.text}`}><span className="mr-2 font-mono text-[11px] text-amber-200/80">[{item.kind || "작업"}]</span>{item.text}</li>)}</ul></Callout>}
  </article>;
}

function JumpTabs({ label, items, active, onSelect }: { label: string; items: Array<{ id: string; label: string }>; active: string; onSelect: (id: string) => void }) {
  return <nav aria-label={label} className="sticky top-0 z-20 -mx-1 overflow-x-auto border-b border-white/[0.08] bg-[var(--color-background)]/95 px-1 py-1.5 backdrop-blur">
    <div className="flex min-w-max gap-0.5">{items.map((item, index) => <button key={item.id} type="button" aria-current={active === item.id ? "true" : undefined} onClick={() => onSelect(item.id)} className={cn("max-w-[260px] rounded-md px-2.5 py-1.5 text-left text-[12.5px] transition-colors", active === item.id ? "bg-white/[0.06] text-cyan-100" : "text-slate-400 hover:text-slate-200")}><span className="mr-1.5 font-mono text-[10.5px] text-slate-500">{String(index + 1).padStart(2, "0")}</span><span className="inline-block max-w-[210px] truncate align-bottom">{item.label}</span></button>)}</div>
  </nav>;
}

function LearningCard({ item }: { item: WeeklyLearningView }) {
  const rationale = [...item.rationaleRecorded, ...item.rationaleUnverified.map((value) => `근거 기록 없음 · ${value}`), ...(item.rationaleGeneral ? [`일반론 · ${item.rationaleGeneral}`] : [])];
  return <article className="space-y-4">
    <header>
      <div className="flex flex-wrap items-center gap-2"><h3 className={H3}>{item.name}</h3>{item.category && <Chip>{item.category}</Chip>}{item.level && <Chip>{item.level}</Chip>}</div>
      {item.relatedTopics.length > 0 && <p className="mt-1.5 text-[12px] text-slate-500">쓰인 작업: {item.relatedTopics.join(", ")}</p>}
    </header>
    {item.definition && <Callout title="정의" tone="note"><p className="text-[14px] leading-[1.7] text-slate-200">{item.definition}</p></Callout>}
    <div className="grid gap-x-8 gap-y-4 xl:grid-cols-2">
      <Field label="핵심 개념" items={item.keyPoints} />
      <Field label="동작 원리" items={item.howItWorks} />
      <Field label="이번 작업에서의 예" items={item.example} />
      <Field label="쓸 때" items={item.whenToUse} />
      <Field label="피할 때" items={item.whenNotToUse} />
      <Field label="보완재" items={item.complements.map((value) => `${value.name} — ${value.why}`)} />
    </div>
    {item.pitfalls.length > 0 && <Callout title="흔한 함정"><Bullets items={item.pitfalls} /></Callout>}
    {item.alternatives.length > 0 && <div className="overflow-x-auto"><h4 className="mb-1.5 text-[12px] font-semibold text-slate-400">대체재 비교</h4><table className="w-full min-w-[660px] border-collapse text-left text-[13px] text-slate-300"><thead><tr>{["대체재", "장점", "단점", "더 맞는 상황"].map((head) => <th key={head} className="border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 font-semibold text-slate-200">{head}</th>)}</tr></thead><tbody>{item.alternatives.map((alt) => <tr key={alt.name}><td className="border border-white/[0.08] px-3 py-1.5 font-semibold text-slate-200">{alt.name}</td><td className="border border-white/[0.08] px-3 py-1.5">{alt.pros}</td><td className="border border-white/[0.08] px-3 py-1.5">{alt.cons}</td><td className="border border-white/[0.08] px-3 py-1.5">{alt.when}</td></tr>)}</tbody></table></div>}
    {rationale.length > 0 && <Field label="선택 근거" items={rationale} />}
    {item.quiz.length > 0 && <div className="space-y-1.5">{item.quiz.map((quiz) => <details key={quiz.question} className="rounded-md border border-white/[0.08] px-3 py-2 text-[14px] text-slate-300"><summary className="cursor-pointer text-slate-200">Q. {quiz.question}</summary><p className="mt-2 leading-[1.7]">{quiz.answer}</p></details>)}</div>}
    {item.keywords.length > 0 && <div className="flex flex-wrap gap-1.5">{item.keywords.map((keyword) => <Chip key={keyword} mono>{keyword}</Chip>)}</div>}
  </article>;
}

function ReportBody({ detail, tab, onTabChange }: { detail: WeeklyReportDetail; tab: WeeklyDetailView; onTabChange: (tab: WeeklyDetailView) => void }) {
  const view = useMemo(() => toWeeklyView(detail.report), [detail]);
  const topicTabs = useMemo(() => view.topics.map((topic, index) => ({ id: `weekly-topic-${index}`, label: topic.title })), [view.topics]);
  const learningTabs = useMemo(() => view.learning.map((item, index) => ({ id: `weekly-learning-${index}`, label: item.name })), [view.learning]);
  const [activeTopic, setActiveTopic] = useWeeklyScrollSpy(topicTabs.map((item) => item.id), tab === "report");
  const [activeLearning, setActiveLearning] = useWeeklyScrollSpy(learningTabs.map((item) => item.id), tab === "learning");
  const jumpTo = (id: string, setActive: (id: string) => void) => { setActive(id); document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  return <div>
    <nav className="mb-6 flex gap-6 border-b border-white/[0.08]" aria-label="Weekly 보기">{([["report", "주간 작업", view.topics.length], ["learning", "기술 학습", view.learning.length]] as const).map(([key, label, count]) => <button key={key} onClick={() => onTabChange(key)} className={cn("-mb-px border-b-2 px-0.5 pb-2.5 text-[13px] font-semibold", tab === key ? "border-cyan-400 text-slate-100" : "border-transparent text-slate-500 hover:text-slate-300")}>{label}<Count>{count}</Count></button>)}</nav>
    {tab === "report" ? <div>
      {view.lastWeekPlan.length > 0 && <section id="weekly-plan" className={SECTION}><h2 className={H2}>지난주 계획</h2><Bullets items={view.lastWeekPlan.map((item) => item.status ? `[${item.status}] ${item.text}` : item.text)} /></section>}
      {view.topics.length > 0 && <section id="weekly-topics" className={SECTION}><h2 className={H2}>주제<Count>{view.topics.length}</Count></h2><JumpTabs label="주제 바로가기" items={topicTabs} active={activeTopic} onSelect={(id) => jumpTo(id, setActiveTopic)} /><div className="mt-6 space-y-10">{view.topics.map((topic, index) => <div id={topicTabs[index].id} key={`${index}-${topic.title}`} className="scroll-mt-14"><Topic topic={topic} /></div>)}</div></section>}
      {view.blocked.length > 0 && <section id="weekly-blocked" className={SECTION}><h2 className={H2}>막힌 것</h2><Callout title={`막힌 것 ${view.blocked.length}`}><Bullets items={view.blocked} /></Callout></section>}
      {view.nextWeek.length > 0 && <section id="weekly-next" className={SECTION}><h2 className={H2}>다음 주</h2><Bullets items={view.nextWeek} /></section>}
    </div> : <div>
      {view.learningSummary.length > 0 && <section className={SECTION}><h2 className={H2}>이번 주 배운 것</h2><Bullets items={view.learningSummary} /></section>}
      {view.learning.length > 0 && <section className={SECTION}><h2 className={H2}>기술 학습<Count>{view.learning.length}</Count></h2><JumpTabs label="기술 학습 바로가기" items={learningTabs} active={activeLearning} onSelect={(id) => jumpTo(id, setActiveLearning)} /><div className="mt-6 space-y-10">{view.learning.map((item, index) => <div id={learningTabs[index].id} key={`${index}-${item.name}`} className="scroll-mt-14"><LearningCard item={item} /></div>)}</div></section>}
    </div>}
  </div>;
}

const monthLabel = (date: string) => `${date.slice(0, 4)}년 ${Number(date.slice(5, 7))}월`;

/** 왼쪽 주차 목록. 접으면 본문이 전체 폭을 쓴다. */
function WeekRail({ reports, selected, onSelect }: { reports: WeeklyReportSummary[]; selected: string; onSelect: (weekId: string) => void }) {
  const months = Object.entries(reports.reduce<Record<string, WeeklyReportSummary[]>>((groups, report) => { (groups[monthLabel(report.start)] ??= []).push(report); return groups; }, {}));
  return <nav aria-label="주차 목록" className="ck-scroll space-y-4 rounded-xl border border-white/[0.07] bg-[#0a101b] p-2 xl:sticky xl:top-4 xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto">
    {months.map(([label, items]) => <div key={label}>
      <p className="px-2.5 pb-1 text-[11px] font-semibold text-slate-500">{label}</p>
      {items.map((report) => {
        const active = report.weekId === selected;
        return <button key={report.weekId} type="button" aria-current={active ? "true" : undefined} aria-label={`${report.weekId} 주간 작업 리포트 열기`} onClick={() => onSelect(report.weekId)} className={cn("block w-full border-l-2 px-2.5 py-1.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-300/60", active ? "border-cyan-400 bg-white/[0.04]" : "border-transparent hover:bg-white/[0.025]")}>
          <span className="flex items-baseline justify-between gap-2"><span className={cn("font-mono text-[12px]", active ? "font-semibold text-slate-100" : "text-slate-400")}>{report.weekId}</span><span className="font-mono text-[10.5px] text-slate-600">{report.start.slice(5)}</span></span>
          <span className={cn("mt-0.5 block truncate text-[11.5px]", active ? "text-slate-300" : "text-slate-500")}>{report.headline[0] ?? "요약 없음"}</span>
        </button>;
      })}
    </div>)}
  </nav>;
}

/** 문서 머리. 주차를 제목으로, 기간·생성일·항목 수를 한 줄 메타로 둔다. */
function DocHeader({ report }: { report: WeeklyReportSummary }) {
  const counts = report.counts;
  return <header className="mb-8">
    <h1 className="font-mono text-[20px] font-semibold tracking-tight text-white">{report.weekId}</h1>
    <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-slate-500"><span className="font-mono">{report.start} — {report.end}</span><span>생성 {report.generatedAt.slice(0, 10)}</span>{counts && <span>주제 {counts.topics} · 기술 학습 {counts.learnings} · 다음 주 {counts.nextWeek}</span>}</p>
    {report.headline.length > 0 && <div className="mt-5"><Bullets items={report.headline} /></div>}
  </header>;
}

const RAIL_KEY = "sugo.weekly.railOpen";
function readRailOpen(): boolean {
  try { return localStorage.getItem(RAIL_KEY) !== "0"; } catch { return true; }
}

export function WeeklyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const routeState = readWeeklyRouteState(searchParams);
  const [reports, setReports] = useState<WeeklyReportSummary[] | null>(null); const [detail, setDetail] = useState<WeeklyReportDetail | null>(null);
  const navigate = useNavigate();
  const [scheduleOff, setScheduleOff] = useState(false);
  const [railOpen, setRailOpen] = useState(readRailOpen);
  // 주를 고르지 않았으면 가장 최근 주를 연다.
  const selected = routeState.weekId ?? reports?.[0]?.weekId ?? null;
  useEffect(() => { listWeeklyReports().then(setReports).catch(() => setReports([])); }, []);
  useEffect(() => { getWeeklySettings().then((settings) => setScheduleOff(!settings.enabled)).catch(() => setScheduleOff(false)); }, []);
  useEffect(() => { if (!selected) return setDetail(null); let cancelled = false; setDetail(null); getWeeklyReport(selected).then((value) => !cancelled && setDetail(value)).catch(() => !cancelled && setDetail(null)); return () => { cancelled = true; }; }, [selected]);
  const index = reports?.findIndex((report) => report.weekId === selected) ?? -1;
  const selectedReport = index >= 0 ? reports![index] : undefined;
  const readerRef = useRef<HTMLElement>(null);
  const select = (weekId: string) => {
    setSearchParams(writeWeeklyRouteState(searchParams, weekId, "report"), { replace: true });
    // 아래로 읽던 중 다른 주를 고르면 새 주의 맨 위부터 보여 준다.
    if ((readerRef.current?.getBoundingClientRect().top ?? 0) < 0) readerRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  };
  const toggleRail = () => setRailOpen((open) => {
    // 저장하지 못해도(사생활 보호 모드 등) 이번 화면에서는 그대로 접고 편다.
    try { localStorage.setItem(RAIL_KEY, open ? "0" : "1"); } catch { /* 선택 기억만 못 한다 */ }
    return !open;
  });
  const older = reports && index >= 0 ? reports[index + 1] : undefined;
  const newer = reports && index > 0 ? reports[index - 1] : undefined;
  const iconButton = "grid h-8 w-8 place-items-center rounded-md border border-white/[0.08] text-slate-400 transition-colors hover:border-white/15 hover:text-slate-100 disabled:opacity-30";
  return <div className="w-full space-y-5"><PageHeading eyebrow="WEEKLY REVIEW" title="주간 작업 리포트" description="한 주의 작업 결과와 기술 학습을 기록하고 다시 확인합니다." />{scheduleOff && <NoticeBar title="주간 리포트 자동 정리가 꺼져 있습니다." detail="켜면 정한 요일과 시각에 리포트를 만들고, 꺼져 있는 동안은 /sugo:weekly로 직접 만들 수 있습니다." actionLabel="주간 리포트 설정 열기" onAction={() => navigate("/preferences?tab=weekly")} />}
    {reports !== null && reports.length === 0 ? <p className="text-[13px] text-slate-400">보고서가 없습니다.</p> : reports && selected && <div className={cn("grid items-start gap-6", railOpen && "xl:grid-cols-[240px_minmax(0,1fr)]")}>
      {railOpen && <WeekRail reports={reports} selected={selected} onSelect={select} />}
      {/* 전역 CSS가 main에 점무늬 배경을 강제하므로 문서 영역은 article로 둔다. */}
      <article ref={readerRef} aria-label="주간 리포트 본문" className="min-w-0 scroll-mt-4 rounded-xl border border-white/[0.07] bg-[#0a101b]">
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
          <button type="button" onClick={toggleRail} aria-pressed={railOpen} title={railOpen ? "주차 목록 닫기" : "주차 목록 열기"} className={iconButton}>{railOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}<span className="sr-only">{railOpen ? "주차 목록 닫기" : "주차 목록 열기"}</span></button>
          <span className="ml-1 font-mono text-[12px] text-slate-400">{selectedReport ? `weekly / ${selectedReport.weekId}.md` : ""}</span>
          <span className="ml-auto flex items-center gap-1.5">
            <button type="button" disabled={!older} onClick={() => older && select(older.weekId)} title="이전 주" className={iconButton}><ChevronLeft size={15} /><span className="sr-only">이전 주</span></button>
            <button type="button" disabled={!newer} onClick={() => newer && select(newer.weekId)} title="다음 주" className={iconButton}><ChevronRight size={15} /><span className="sr-only">다음 주</span></button>
          </span>
        </div>
        <div className="mx-auto max-w-[1280px] px-6 py-8 sm:px-10">
          {selectedReport && <DocHeader report={selectedReport} />}
          {detail ? <ReportBody detail={detail} tab={routeState.view} onTabChange={(view) => setSearchParams(writeWeeklyRouteState(searchParams, selected, view), { replace: true })} /> : <div className="h-28 animate-pulse rounded-md bg-white/[0.03]" />}
        </div>
      </article>
    </div>}
  </div>;
}
