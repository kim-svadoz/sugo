export interface WeeklyTopicView {
  title: string;
  workspace: string;
  category: string;
  oneLine: string;
  context: string;
  goal: string;
  done: string[];
  results: string[];
  todo: string[];
}

export interface WeeklyPlanItemView {
  text: string;
  status: string;
}

export interface WeeklyView {
  headline: string[];
  topics: WeeklyTopicView[];
  nextWeek: string[];
  blocked: string[];
  lastWeekPlan: WeeklyPlanItemView[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function strings(value: unknown): string[] {
  return list(value).filter((item): item is string => typeof item === "string");
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function textsOf(value: unknown): string[] {
  return list(value).map((item) => text(record(item).text)).filter(Boolean);
}

/** weekly가 보낸 보고서 JSON은 외부 입력이라, 있는 필드만 골라 화면 모델로 바꾼다. */
export function toWeeklyView(report: Record<string, unknown>): WeeklyView {
  return {
    headline: strings(report.headline),
    topics: list(report.topics).map((raw) => {
      const topic = record(raw);
      return {
        title: text(topic.title),
        workspace: text(topic.workspace),
        category: text(topic.category),
        oneLine: text(topic.one_line),
        context: text(topic.context),
        goal: text(topic.goal),
        done: strings(topic.done),
        results: strings(topic.results),
        todo: textsOf(topic.todo),
      };
    }),
    nextWeek: textsOf(report.next_week),
    blocked: textsOf(report.blocked),
    lastWeekPlan: list(report.last_week_plan)
      .map((raw) => ({ text: text(record(raw).text), status: text(record(raw).status) }))
      .filter((item) => item.text),
  };
}
