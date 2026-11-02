import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getWeeklyReport, getWeeklySettings, listWeeklyReports, type WeeklyReportDetail, type WeeklyReportSummary } from "../api/weeklyApi.js";
import { toWeeklyView, type WeeklyLearningView, type WeeklyTopicView } from "../lib/weeklyPresentation.js";
import { cn } from "../lib/utils.js";
import { PageHeading } from "../components/PageHeading.js";
import { NoticeBar } from "../components/NoticeBar.js";
import { readWeeklyRouteState, writeWeeklyRouteState, type WeeklyDetailView } from "../lib/weeklyRouteState.js";
import { selectWeeklySection } from "../lib/weeklyScrollSpy.js";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronLeft, ChevronRight, Code2, Eye, FileText, GraduationCap, Hammer, HelpCircle, Lightbulb, Link2, ListChecks, PanelLeftClose, PanelLeftOpen, Scale, Sparkles, Target, Workflow, XCircle } from "lucide-react";

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
const H3 = "text-[15px] font-semibold text-cyan-100";

function Count({ children }: { children: number }) { return <span className="ml-1.5 font-mono text-[11px] text-slate-500">{children}</span>; }

function Chip({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) { return <span className={cn("rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-slate-300", mono && "font-mono")}>{children}</span>; }

/* 기술 학습은 문서가 아니라 학습 카드로 보여 준다. 남색 표면과 청록 강조만 쓰고, 항목마다 읽는 방식에 맞는 모양을 준다. */
const STUDY_CARD = "rounded-2xl border border-white/[0.08] bg-[linear-gradient(180deg,rgba(15,26,43,0.96),rgba(9,15,26,0.96))] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_18px_36px_-26px_rgba(0,0,0,0.85)]";
const LEVELS = ["기초", "중급", "심화"];

function LevelMeter({ level }: { level: string }) {
  const rank = LEVELS.indexOf(level) + 1;
  if (rank === 0) return level ? <Chip>{level}</Chip> : null;
  return <span className="inline-flex items-center gap-1.5 text-[11.5px] text-slate-400" title={`난이도 ${level}`}>
    <span className="flex items-end gap-[3px]" aria-hidden="true">{[1, 2, 3].map((step) => <span key={step} className={cn("w-[4px] rounded-sm", step <= rank ? "bg-cyan-300" : "bg-white/15")} style={{ height: 4 + step * 3 }} />)}</span>{level}
  </span>;
}

function StudyHeading({ icon: Icon, children, tone = "cyan" }: { icon: typeof Lightbulb; children: React.ReactNode; tone?: "cyan" | "emerald" | "rose" | "amber" | "violet" }) {
  const color = { cyan: "text-cyan-300", emerald: "text-emerald-300", rose: "text-rose-300", amber: "text-amber-300", violet: "text-violet-300" }[tone];
  return <h4 className="mb-3 flex items-center gap-2 text-[12.5px] font-semibold text-slate-200"><Icon size={14} className={color} />{children}</h4>;
}

function QuizCard({ question, answer, revealed, onReveal }: { question: string; answer: string; revealed: boolean; onReveal: () => void }) {
  return <div className={cn("rounded-xl border p-4 transition-colors", revealed ? "border-cyan-300/25 bg-cyan-300/[0.04]" : "border-white/[0.08] bg-white/[0.02]")}>
    <p className="flex gap-2 text-[14px] font-medium leading-[1.6] text-slate-100"><span className="font-mono text-cyan-300">Q.</span>{question}</p>
    {revealed
      ? <ul className="mt-3 space-y-1 border-t border-white/[0.06] pt-3 text-[13px] leading-[1.65] text-slate-300">{answer.split("\n").filter(Boolean).map((line) => <li key={line} className="flex gap-2"><Check size={13} className="mt-[5px] shrink-0 text-cyan-300" />{line}</li>)}</ul>
      : <button type="button" onClick={onReveal} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-[12px] font-semibold text-slate-300 transition-colors hover:border-cyan-300/40 hover:text-cyan-100"><Eye size={13} />정답 보기</button>}
  </div>;
}

function LearningCard({ item, index }: { item: WeeklyLearningView; index: number }) {
  const [revealed, setRevealed] = useState<Set<number>>(new Set());
  const rationale = [...item.rationaleRecorded, ...item.rationaleUnverified.map((value) => `근거 기록 없음 · ${value}`), ...(item.rationaleGeneral ? [item.rationaleGeneral] : [])];
  return <article className={cn(STUDY_CARD, "overflow-hidden")}>
    <header className="border-b border-white/[0.06] px-6 pb-5 pt-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-mono text-[11px] text-slate-500">{String(index + 1).padStart(2, "0")}</span>
        {item.category && <span className="rounded-md bg-cyan-400/10 px-2 py-0.5 text-[11px] font-medium text-cyan-200">{item.category}</span>}
        <LevelMeter level={item.level} />
        {item.quiz.length > 0 && <span className="ml-auto font-mono text-[11px] text-slate-500">퀴즈 {revealed.size}/{item.quiz.length}</span>}
      </div>
      <h3 className="mt-2.5 text-[20px] font-semibold tracking-tight text-white">{item.name}</h3>
      {item.definition && <p className="mt-2 max-w-4xl text-[15px] leading-[1.65] text-slate-300">{item.definition}</p>}
      {item.relatedTopics.length > 0 && <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px] text-slate-500"><Link2 size={12} />{item.relatedTopics.map((topic) => <span key={topic} className="rounded-md border border-white/[0.08] px-1.5 py-0.5 text-slate-400">{topic}</span>)}</p>}
    </header>

    <div className="grid gap-6 px-6 py-6 xl:grid-cols-2">
      {item.keyPoints.length > 0 && <section><StudyHeading icon={Lightbulb}>핵심 개념</StudyHeading>
        <ol className="space-y-2.5">{item.keyPoints.map((point, step) => <li key={point} className="flex gap-3 text-[14px] leading-[1.6] text-slate-200"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-cyan-400/15 font-mono text-[10.5px] font-semibold text-cyan-200">{step + 1}</span><span className="min-w-0">{point}</span></li>)}</ol>
      </section>}
      {item.howItWorks.length > 0 && <section><StudyHeading icon={Workflow} tone="violet">동작 원리</StudyHeading>
        <ol className="relative space-y-3 pl-5 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-violet-300/25">{item.howItWorks.map((step) => <li key={step} className="relative text-[14px] leading-[1.6] text-slate-200"><span className="absolute -left-5 top-[7px] h-[11px] w-[11px] rounded-full border-2 border-violet-300/60 bg-[#0b1220]" />{step}</li>)}</ol>
      </section>}
    </div>

    {item.example.length > 0 && <section className="mx-6 mb-6"><StudyHeading icon={Code2} tone="emerald">이번 작업에서의 예</StudyHeading>
      <div className="rounded-xl border border-white/[0.07] bg-[#060b14] px-4 py-3 font-mono text-[12.5px] leading-[1.8] text-emerald-100/90">{item.example.map((line) => <p key={line} className="flex gap-3"><span className="select-none text-slate-600">›</span><span className="min-w-0 break-words">{line}</span></p>)}</div>
    </section>}

    {(item.whenToUse.length > 0 || item.whenNotToUse.length > 0) && <section className="mx-6 mb-6 grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04] p-4"><StudyHeading icon={CheckCircle2} tone="emerald">이럴 때 쓴다</StudyHeading><ul className="space-y-1.5 text-[13.5px] leading-[1.6] text-slate-200">{item.whenToUse.map((line) => <li key={line}>{line}</li>)}</ul></div>
      <div className="rounded-xl border border-rose-400/15 bg-rose-400/[0.04] p-4"><StudyHeading icon={XCircle} tone="rose">이럴 땐 피한다</StudyHeading><ul className="space-y-1.5 text-[13.5px] leading-[1.6] text-slate-200">{item.whenNotToUse.map((line) => <li key={line}>{line}</li>)}</ul></div>
    </section>}

    {item.pitfalls.length > 0 && <section className="mx-6 mb-6"><StudyHeading icon={AlertTriangle} tone="amber">흔한 함정</StudyHeading>
      <ul className="space-y-2">{item.pitfalls.map((line) => <li key={line} className="flex gap-3 rounded-lg border-l-2 border-amber-400/60 bg-amber-400/[0.04] px-3 py-2 text-[13.5px] leading-[1.6] text-slate-200">{line}</li>)}</ul>
    </section>}

    {(item.alternatives.length > 0 || item.complements.length > 0) && <section className="mx-6 mb-6 grid gap-4 xl:grid-cols-2">
      {item.alternatives.length > 0 && <div><StudyHeading icon={Scale}>대신 쓸 수 있는 것</StudyHeading><div className="space-y-2">{item.alternatives.map((alt) => <div key={alt.name} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5">
        <p className="text-[14px] font-semibold text-slate-100">{alt.name}</p>
        <dl className="mt-2 grid gap-1 text-[12.5px] leading-[1.55]"><div className="flex gap-2"><dt className="w-10 shrink-0 text-emerald-300">장점</dt><dd className="text-slate-300">{alt.pros}</dd></div><div className="flex gap-2"><dt className="w-10 shrink-0 text-rose-300">단점</dt><dd className="text-slate-300">{alt.cons}</dd></div><div className="flex gap-2"><dt className="w-10 shrink-0 text-slate-500">상황</dt><dd className="text-slate-400">{alt.when}</dd></div></dl>
      </div>)}</div></div>}
      {item.complements.length > 0 && <div><StudyHeading icon={Link2}>함께 쓰는 것</StudyHeading><div className="space-y-2">{item.complements.map((value) => <div key={value.name} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5"><p className="text-[14px] font-semibold text-slate-100">{value.name}</p><p className="mt-1 text-[12.5px] leading-[1.55] text-slate-400">{value.why}</p></div>)}</div></div>}
    </section>}

    {rationale.length > 0 && <section className="mx-6 mb-6"><StudyHeading icon={FileText} tone="violet">이번에 이렇게 고른 이유</StudyHeading><ul className="space-y-1.5 text-[13.5px] leading-[1.6] text-slate-300">{rationale.map((line) => <li key={line} className="flex gap-2"><span className="mt-[9px] h-1 w-1 shrink-0 rounded-full bg-slate-500" />{line}</li>)}</ul></section>}

    {item.quiz.length > 0 && <section className="border-t border-white/[0.06] bg-black/10 px-6 py-5"><StudyHeading icon={HelpCircle}>스스로 확인하기</StudyHeading>
      <div className="grid gap-3 xl:grid-cols-2">{item.quiz.map((quiz, quizIndex) => <QuizCard key={quiz.question} question={quiz.question} answer={quiz.answer} revealed={revealed.has(quizIndex)} onReveal={() => setRevealed((current) => new Set(current).add(quizIndex))} />)}</div>
    </section>}

    {item.keywords.length > 0 && <footer className="flex flex-wrap gap-1.5 border-t border-white/[0.06] px-6 py-4">{item.keywords.map((keyword) => <span key={keyword} className="rounded-md bg-white/[0.04] px-2 py-0.5 font-mono text-[11px] text-slate-400">#{keyword}</span>)}</footer>}
  </article>;
}

/** 기술 학습 탭: 왼쪽에 학습 목차, 오른쪽에 학습 카드. */
function LearningView({ summary, items, ids, active, onSelect }: { summary: string[]; items: WeeklyLearningView[]; ids: string[]; active: string; onSelect: (id: string) => void }) {
  return <div className="space-y-6">
    {summary.length > 0 && <section className={cn(STUDY_CARD, "px-6 py-5")}>
      <p className="flex items-center gap-2 text-[12.5px] font-semibold text-cyan-200"><GraduationCap size={15} />이번 주 배운 것<span className="font-mono text-[11px] font-normal text-slate-500">기술 {items.length}개</span></p>
      <ul className="mt-3 space-y-2">{summary.map((line) => <li key={line} className="flex gap-3 text-[14.5px] leading-[1.6] text-slate-100"><Check size={15} className="mt-[4px] shrink-0 text-cyan-300" />{line}</li>)}</ul>
    </section>}
    <div className="grid items-start gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="기술 학습 목차" className="hidden xl:sticky xl:top-4 xl:block">
        <p className="mb-2 px-2.5 text-[11px] font-semibold text-slate-500">학습 목차</p>
        {items.map((item, index) => <button key={ids[index]} type="button" aria-current={active === ids[index] ? "true" : undefined} onClick={() => onSelect(ids[index])} className={cn("block w-full border-l-2 px-2.5 py-1.5 text-left transition-colors", active === ids[index] ? "border-cyan-400 bg-white/[0.04]" : "border-transparent hover:bg-white/[0.025]")}>
          <span className={cn("block truncate text-[13px]", active === ids[index] ? "font-semibold text-slate-100" : "text-slate-400")}>{item.name}</span>
          <span className="mt-0.5 block truncate text-[11px] text-slate-500">{[item.category, item.level].filter(Boolean).join(" · ")}</span>
        </button>)}
      </nav>
      <div className="min-w-0 space-y-6">{items.map((item, index) => <div id={ids[index]} key={`${index}-${item.name}`} className="scroll-mt-6"><LearningCard item={item} index={index} /></div>)}</div>
    </div>
  </div>;
}

const PLAN_STATUS: Record<string, string> = { 완료: "bg-emerald-400/15 text-emerald-200", 진행: "bg-cyan-400/15 text-cyan-200", 미착수: "bg-slate-400/15 text-slate-300", "판단 불가": "bg-amber-400/15 text-amber-200" };
const CATEGORY_TONE: Record<string, string> = { 기능: "bg-cyan-400/10 text-cyan-200", 수정: "bg-violet-400/10 text-violet-200", 개선: "bg-emerald-400/10 text-emerald-200", 도구: "bg-blue-400/10 text-blue-200", 운영: "bg-amber-400/10 text-amber-200" };

function TopicCard({ topic, index }: { topic: WeeklyTopicView; index: number }) {
  return <article className={cn(STUDY_CARD, "overflow-hidden")}>
    <header className="border-b border-white/[0.06] px-6 pb-5 pt-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-mono text-[11px] text-slate-500">{String(index + 1).padStart(2, "0")}</span>
        {topic.category && <span className={cn("rounded-md px-2 py-0.5 text-[11px] font-medium", CATEGORY_TONE[topic.category] ?? "bg-slate-400/10 text-slate-300")}>{topic.category}</span>}
        {topic.workspace && <span className="rounded-md border border-white/[0.08] px-1.5 py-0.5 font-mono text-[11px] text-slate-400">{topic.workspace}</span>}
      </div>
      <h3 className="mt-2.5 text-[18px] font-semibold tracking-tight text-white">{topic.title}</h3>
      {topic.oneLine && <p className="mt-1.5 text-[14.5px] leading-[1.6] text-slate-300">{topic.oneLine}</p>}
    </header>
    {(topic.context || topic.goal) && <div className="grid gap-3 px-6 pt-5 md:grid-cols-2">
      {topic.context && <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"><StudyHeading icon={FileText} tone="violet">상황</StudyHeading><p className="text-[13.5px] leading-[1.65] text-slate-300">{topic.context}</p></div>}
      {topic.goal && <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"><StudyHeading icon={Target}>목적</StudyHeading><p className="text-[13.5px] leading-[1.65] text-slate-300">{topic.goal}</p></div>}
    </div>}
    <div className="grid gap-6 px-6 py-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      {topic.done.length > 0 && <section><StudyHeading icon={Hammer}>한 일</StudyHeading>
        <ol className="space-y-2.5">{topic.done.map((line, step) => <li key={line} className="flex gap-3 text-[14px] leading-[1.6] text-slate-200"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-cyan-400/15 font-mono text-[10.5px] font-semibold text-cyan-200">{step + 1}</span><span className="min-w-0 break-words">{line}</span></li>)}</ol>
      </section>}
      {topic.results.length > 0 && <section><StudyHeading icon={CheckCircle2} tone="emerald">검증</StudyHeading>
        <ul className="space-y-2">{topic.results.map((line) => <li key={line} className="flex gap-2.5 rounded-lg bg-emerald-400/[0.04] px-3 py-2 text-[13.5px] leading-[1.6] text-slate-200"><Check size={14} className="mt-[4px] shrink-0 text-emerald-300" /><span className="min-w-0 break-words">{line}</span></li>)}</ul>
      </section>}
    </div>
    {topic.todo.length > 0 && <section className="border-t border-white/[0.06] bg-amber-400/[0.03] px-6 py-4"><StudyHeading icon={AlertTriangle} tone="amber">남은 일 {topic.todo.length}</StudyHeading>
      <ul className="space-y-1.5">{topic.todo.map((item) => <li key={`${item.kind}-${item.text}`} className="flex flex-wrap items-baseline gap-2 text-[13.5px] leading-[1.6] text-slate-200"><span className="rounded-md bg-amber-300/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-200">{item.kind || "작업"}</span>{item.text}</li>)}</ul>
    </section>}
  </article>;
}

/** 주간 작업 탭: 지난주 계획 체크리스트, 왼쪽 주제 목차와 주제 카드, 막힌 것·다음 주 카드. */
function ReportView({ view, ids, active, onSelect }: { view: ReturnType<typeof toWeeklyView>; ids: string[]; active: string; onSelect: (id: string) => void }) {
  return <div className="space-y-6">
    {view.lastWeekPlan.length > 0 && <section id="weekly-plan" className={cn(STUDY_CARD, "scroll-mt-16 px-6 py-5")}>
      <p className="mb-3 flex items-center gap-2 text-[12.5px] font-semibold text-slate-200"><ListChecks size={15} className="text-cyan-300" />지난주 계획<span className="font-mono text-[11px] font-normal text-slate-500">{view.lastWeekPlan.length}</span></p>
      <ul className="divide-y divide-white/[0.05]">{view.lastWeekPlan.map((item) => <li key={`${item.status}-${item.text}`} className="flex items-start gap-3 py-2.5 text-[14px] leading-[1.6] text-slate-200"><span className={cn("mt-[2px] w-[68px] shrink-0 rounded-md px-1.5 py-0.5 text-center text-[11px] font-medium", PLAN_STATUS[item.status] ?? "bg-slate-400/15 text-slate-300")}>{item.status || "기록 없음"}</span><span className="min-w-0 break-words">{item.text}</span></li>)}</ul>
    </section>}
    {view.topics.length > 0 && <div id="weekly-topics" className="grid scroll-mt-16 items-start gap-6 xl:grid-cols-[220px_minmax(0,1fr)]">
      <nav aria-label="주제 목차" className="hidden xl:sticky xl:top-4 xl:block">
        <p className="mb-2 px-2.5 text-[11px] font-semibold text-slate-500">주제 {view.topics.length}</p>
        {view.topics.map((topic, index) => <button key={ids[index]} type="button" aria-current={active === ids[index] ? "true" : undefined} onClick={() => onSelect(ids[index])} className={cn("block w-full border-l-2 px-2.5 py-1.5 text-left transition-colors", active === ids[index] ? "border-cyan-400 bg-white/[0.04]" : "border-transparent hover:bg-white/[0.025]")}>
          <span className={cn("block truncate text-[13px]", active === ids[index] ? "font-semibold text-slate-100" : "text-slate-400")}>{topic.title}</span>
          <span className="mt-0.5 block truncate text-[11px] text-slate-500">{[topic.category, topic.workspace].filter(Boolean).join(" · ")}</span>
        </button>)}
      </nav>
      <div className="min-w-0 space-y-6">{view.topics.map((topic, index) => <div id={ids[index]} key={`${index}-${topic.title}`} className="scroll-mt-6"><TopicCard topic={topic} index={index} /></div>)}</div>
    </div>}
    {(view.blocked.length > 0 || view.nextWeek.length > 0) && <div className="grid gap-4 xl:grid-cols-2">
      {view.blocked.length > 0 && <section id="weekly-blocked" className="scroll-mt-16 rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] px-6 py-5"><StudyHeading icon={AlertTriangle} tone="amber">막힌 것 {view.blocked.length}</StudyHeading><ul className="space-y-2 text-[14px] leading-[1.6] text-slate-200">{view.blocked.map((line) => <li key={line} className="flex gap-2.5"><span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />{line}</li>)}</ul></section>}
      {view.nextWeek.length > 0 && <section id="weekly-next" className={cn(STUDY_CARD, "scroll-mt-16 px-6 py-5")}><StudyHeading icon={ArrowRight}>다음 주 할 일 {view.nextWeek.length}</StudyHeading><ul className="space-y-2 text-[14px] leading-[1.6] text-slate-200">{view.nextWeek.map((line) => <li key={line} className="flex gap-2.5"><span className="mt-[5px] h-3.5 w-3.5 shrink-0 rounded border border-cyan-300/40" />{line}</li>)}</ul></section>}
    </div>}
  </div>;
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
    {tab === "report" ? <ReportView view={view} ids={topicTabs.map((tabItem) => tabItem.id)} active={activeTopic} onSelect={(id) => jumpTo(id, setActiveTopic)} /> : <LearningView summary={view.learningSummary} items={view.learning} ids={learningTabs.map((tabItem) => tabItem.id)} active={activeLearning} onSelect={(id) => jumpTo(id, setActiveLearning)} />}
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
    {report.headline.length > 0 && <section className={cn(STUDY_CARD, "mt-5 px-6 py-5")}>
      <p className="flex items-center gap-2 text-[12.5px] font-semibold text-cyan-200"><Sparkles size={15} />이번 주 요약</p>
      <ul className="mt-3 space-y-2">{report.headline.map((line) => <li key={line} className="flex gap-3 text-[14.5px] leading-[1.6] text-slate-100"><Check size={15} className="mt-[4px] shrink-0 text-cyan-300" />{line}</li>)}</ul>
    </section>}
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
