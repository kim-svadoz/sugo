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

export interface WeeklyLearningView {
  name: string; category: string; level: string; definition: string;
  relatedTopics: string[]; keyPoints: string[]; howItWorks: string[];
  example: string[]; whenToUse: string[]; whenNotToUse: string[]; pitfalls: string[];
  alternatives: Array<{ name: string; pros: string; cons: string; when: string }>;
  complements: Array<{ name: string; why: string }>;
  rationaleRecorded: string[]; rationaleUnverified: string[]; rationaleGeneral: string;
  quiz: Array<{ question: string; answer: string }>;
  keywords: string[];
}

export interface WeeklyView {
  headline: string[];
  topics: WeeklyTopicView[];
  nextWeek: string[];
  blocked: string[];
  lastWeekPlan: WeeklyPlanItemView[];
  learningSummary: string[];
  learning: WeeklyLearningView[];
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
  const tech = record(report.tech);
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
    learningSummary: strings(tech.learning_summary),
    learning: list(tech.items).map((raw) => {
      const item = record(raw);
      return {
        name: text(item.name), category: text(item.category), level: text(item.level), definition: text(item.definition),
        relatedTopics: strings(item.topics), keyPoints: strings(item.key_points), howItWorks: strings(item.how_it_works),
        example: strings(item.example), whenToUse: strings(item.when_to_use), whenNotToUse: strings(item.when_not_to_use), pitfalls: strings(item.pitfalls),
        alternatives: list(item.alternatives).map((raw) => { const value = record(raw); return { name: text(value.name), pros: text(value.pros), cons: text(value.cons), when: text(value.when) }; }).filter((value) => value.name),
        complements: list(item.complements).map((raw) => { const value = record(raw); return { name: text(value.name), why: text(value.why) }; }).filter((value) => value.name),
        rationaleRecorded: list(item.rationale_recorded).map((raw) => text(record(raw).text)).filter(Boolean),
        rationaleUnverified: strings(item.rationale_unverified), rationaleGeneral: text(item.rationale_general),
        quiz: list(item.quiz).map((raw) => { const value = record(raw); return { question: text(value.q), answer: text(value.a) }; }).filter((value) => value.question),
        keywords: strings(item.keywords),
      };
    }).filter((item) => item.name),
  };
}
