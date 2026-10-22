import type { ScheduledSpec } from "../api/roadmapMutationsApi.js";

type DevelopmentHistory = NonNullable<ScheduledSpec["development_history"]>[number];

export interface LearningReviewNote {
  specId: string;
  workTitle: string;
  workspace: string;
  updatedAt: string;
  patchVersion: number;
  summary: string[];
  decisions: string[];
  learnings: string[];
  improvements: string[];
  verification: {
    total?: number;
    passed?: number;
    failed?: number;
    state?: string;
    runtimeVerified?: boolean;
    validationVerdict?: string;
  };
}

type ReviewResult = {
  path?: string;
  patchVersion?: number;
  summary?: string;
  report?: {
    summary?: string;
    patchVersion?: number;
    designDecisions?: string[];
    knownLimitations?: string[];
    verification?: {
      test?: { command?: string; total?: number; passed?: number; failed?: number; state?: string };
      runtimeVerified?: boolean;
      validationVerdict?: string;
    };
  };
};

function conciseLines(values: Array<string | null | undefined>, limit: number): string[] {
  return values
    .flatMap((value) => (value ?? "").split(/\n+|(?<=[.!?])\s+/))
    .map((value) => value.replace(/\s+/g, " ").replace(/^[-•]\s*/, "").replace(/\s*\(사용자 결정\)\.?$/, ".").trim())
    .filter((value) => value.length >= 8)
    .map((value) => value.length > 190 ? `${value.slice(0, 187).trim()}…` : value)
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, limit);
}

function learningCandidates(decisions: string[]): string[] {
  const learnings: string[] = [];
  if (decisions.some((value) => /하드코딩/.test(value)) && decisions.some((value) => /layout_key/.test(value))) {
    learnings.push("동작 분기는 화면 식별자를 하드코딩하지 않고 런타임 구성값(layout_key)을 기준으로 둔다.");
  }
  if (decisions.some((value) => /캐시/.test(value) && /인덱스별/.test(value))) {
    learnings.push("데이터 원천이 분리되면 캐시도 원천별로 분리하고, 조회 키는 도메인 식별자로 유지한다.");
  }
  return learnings.slice(0, 2);
}

function reviewDecisions(decisions: string[]): string[] {
  const tradeoffs = decisions.filter((value) => /대신|제거|유지|재사용|트레이드오프/.test(value));
  return [...tradeoffs, ...decisions].filter((value, index, all) => all.indexOf(value) === index).slice(0, 2);
}

export function selectLearningReviewNote(items: Array<{ spec: ScheduledSpec; history: DevelopmentHistory }>): LearningReviewNote | null {
  for (const { spec, history } of items) {
    const result = spec.focus_task_work_result as ReviewResult | null | undefined;
    const report = result?.report;
    const patchVersion = report?.patchVersion ?? result?.patchVersion;
    if (patchVersion !== history.version) continue;

    const allDecisions = conciseLines(report?.designDecisions ?? [], 8);
    const decisions = reviewDecisions(allDecisions);
    const improvements = conciseLines(report?.knownLimitations ?? [], 2);
    const summary = conciseLines([report?.summary, result?.summary, history.summary], 2);
    if (decisions.length === 0 && improvements.length === 0 && summary.length === 0) continue;
    const test = report?.verification?.test;

    return {
      specId: spec.id,
      workTitle: spec.title,
      workspace: spec.workspace_name,
      updatedAt: history.completed_at ?? spec.focus_task_updated_at ?? "",
      patchVersion,
      summary,
      decisions,
      learnings: learningCandidates(allDecisions),
      improvements,
      verification: {
        total: test?.total,
        passed: test?.passed,
        failed: test?.failed,
        state: test?.state,
        runtimeVerified: report?.verification?.runtimeVerified,
        validationVerdict: report?.verification?.validationVerdict,
      },
    };
  }
  return null;
}
