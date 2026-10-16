import { useEffect, useMemo, useState } from "react";
import { getWeeklyReport, listWeeklyReports, type WeeklyReportDetail, type WeeklyReportSummary } from "../api/weeklyApi.js";
import { toWeeklyView, type WeeklyTopicView } from "../lib/weeklyPresentation.js";
import { cn } from "../lib/utils.js";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-[var(--color-text-bright)]">{title}</h2>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1 text-sm leading-6 text-[var(--color-text)]">
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="flex gap-2">
          <span aria-hidden className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-[var(--color-text-dim)]" />
          <span className="min-w-0 break-words">{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Topic({ topic }: { topic: WeeklyTopicView }) {
  const facts: Array<[string, string[]]> = [
    ["목표", topic.goal ? [topic.goal] : []],
    ["배경", topic.context ? [topic.context] : []],
    ["한 일", topic.done],
    ["결과", topic.results],
    ["남은 일", topic.todo],
  ];
  return (
    <article className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <header>
        <p className="font-mono text-[11px] text-[var(--color-text-dim)]">{[topic.workspace, topic.category].filter(Boolean).join(" · ")}</p>
        <h3 className="text-base font-semibold text-[var(--color-text-bright)]">{topic.title}</h3>
        {topic.oneLine && <p className="text-sm text-[var(--color-text-muted)]">{topic.oneLine}</p>}
      </header>
      {facts.map(([label, items]) =>
        items.length > 0 ? (
          <div key={label}>
            <p className="mb-1 text-xs font-semibold text-[var(--color-text-muted)]">{label}</p>
            <Bullets items={items} />
          </div>
        ) : null,
      )}
    </article>
  );
}

function ReportBody({ detail }: { detail: WeeklyReportDetail }) {
  const view = useMemo(() => toWeeklyView(detail.report), [detail]);
  return (
    <div className="space-y-6">
      {view.headline.length > 0 && (
        <Section title="요약">
          <Bullets items={view.headline} />
        </Section>
      )}
      {view.topics.length > 0 && (
        <Section title="주제">
          <div className="space-y-3">
            {view.topics.map((topic, index) => (
              <Topic key={`${index}-${topic.title}`} topic={topic} />
            ))}
          </div>
        </Section>
      )}
      {view.lastWeekPlan.length > 0 && (
        <Section title="지난주 계획">
          <Bullets items={view.lastWeekPlan.map((item) => (item.status ? `[${item.status}] ${item.text}` : item.text))} />
        </Section>
      )}
      {view.nextWeek.length > 0 && (
        <Section title="다음 주">
          <Bullets items={view.nextWeek} />
        </Section>
      )}
      {view.blocked.length > 0 && (
        <Section title="막힌 일">
          <Bullets items={view.blocked} />
        </Section>
      )}
    </div>
  );
}

export function WeeklyPage() {
  const [reports, setReports] = useState<WeeklyReportSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<WeeklyReportDetail | null>(null);

  useEffect(() => {
    listWeeklyReports()
      .then((list) => {
        setReports(list);
        setSelected(list[0]?.weekId ?? null);
      })
      .catch(() => setReports([]));
  }, []);

  useEffect(() => {
    if (!selected) return setDetail(null);
    let cancelled = false;
    getWeeklyReport(selected)
      .then((value) => !cancelled && setDetail(value))
      .catch(() => !cancelled && setDetail(null));
    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-[var(--color-text-bright)]">Weekly</h1>
      {reports !== null && reports.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">보고서가 없습니다.</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
          <nav aria-label="주간 보고서 목록" className="space-y-1">
            {(reports ?? []).map((report) => (
              <button
                key={report.weekId}
                onClick={() => setSelected(report.weekId)}
                aria-pressed={selected === report.weekId}
                className={cn(
                  "block w-full rounded-lg px-3 py-2 text-left transition-colors",
                  selected === report.weekId
                    ? "bg-cyan-400/15 text-cyan-200"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]",
                )}
              >
                <span className="block text-sm font-semibold">{report.weekId}</span>
                <span className="block font-mono text-[11px] opacity-70">
                  {report.start} ~ {report.end}
                </span>
              </button>
            ))}
          </nav>
          <div>{detail && <ReportBody detail={detail} />}</div>
        </div>
      )}
    </div>
  );
}
