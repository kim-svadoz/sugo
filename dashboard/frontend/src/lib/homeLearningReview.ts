import type { ScheduledSpec } from "../api/roadmapMutationsApi.js";

type DevelopmentHistory = NonNullable<ScheduledSpec["development_history"]>[number];

export interface LearningReviewNote {
  specId: string;
  workTitle: string;
  workspace: string;
  updatedAt: string;
  patchVersion: number;
  patchVersions: number[];
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
    .flatMap((value) => (value ?? "").split(/\n+|;\s*|(?<=[.!?])\s+/))
    .map((value) => value.replace(/\s+/g, " ").replace(/^[-•]\s*/, "").replace(/\s*\(사용자 결정\)\.?$/, ".").trim())
    .filter((value) => !/\b(?:baseline|gradle|clean check)\b|시뮬레이터.*(?:호출|확인)|\b\d+\/\d+\s*(?:통과|포함)?/i.test(value))
    .filter((value) => !(/(?:sugo_validate|린트|하네스|trifecta|게이트|규칙)/i.test(value)
      && /(?:pass|통과|준수|문제\s*없|경고(?:는|가)?\s*없|위반(?:은|이)?\s*없|정상)/i.test(value)
      && !/(?:fail|실패|위반|불일치|오류|틀렸|수정\s*(?:필요|해야)|경고\s*(?:있|발생))/i.test(value)))
    .filter((value) => value.length >= 8)
    .map((value) => value.length > 190 ? `${value.slice(0, 187).trim()}…` : value)
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(0, limit);
}

function reviewDecisions(decisions: string[]): string[] {
  const tradeoffs = decisions.filter((value) => /대신|제거|유지|재사용|트레이드오프/.test(value));
  return [...tradeoffs, ...decisions].filter((value, index, all) => all.indexOf(value) === index).slice(0, 2);
}

export function selectLearningReviewNote(items: Array<{ spec: ScheduledSpec; history: DevelopmentHistory }>): LearningReviewNote | null {
  for (const anchor of items) {
    const anchorDate = anchor.history.completed_at ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(anchor.history.completed_at)) : "";
    const group = items.filter(({ spec, history }) => spec.id === anchor.spec.id && spec.workspace_name === anchor.spec.workspace_name && Boolean(anchorDate) && Boolean(history.completed_at) && new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date(history.completed_at!)) === anchorDate);
    const records = (group.length > 0 ? group : [anchor]).map(({ spec, history }) => {
      const embedded = history.work_result as ReviewResult | null | undefined;
      const focused = spec.focus_task_work_result as ReviewResult | null | undefined;
      const focusedVersion = focused?.report?.patchVersion ?? focused?.patchVersion;
      const result = focusedVersion === history.version ? focused : embedded;
      return { spec, history, result, report: result?.report };
    }).filter((record) => record.result || record.history.summary);
    if (records.length === 0) continue;
    const ordered = records.sort((a, b) => a.history.version - b.history.version);
    const latest = ordered[ordered.length - 1];

    const allDecisions = conciseLines(ordered.flatMap(({ report }) => report?.designDecisions ?? []), 12);
    const summary = conciseLines(ordered.flatMap(({ report, result, history }) => [report?.summary, result?.summary, history.summary]), 6);
    const explicitSummaryDecisions = summary.filter((value) => /대신|제거|유지|재사용|분리|변경/.test(value));
    const decisions = reviewDecisions([...allDecisions, ...explicitSummaryDecisions]);
    const improvements = conciseLines(ordered.flatMap(({ report }) => report?.knownLimitations ?? []), 2);
    if (decisions.length === 0 && improvements.length === 0 && summary.length === 0) continue;
    const test = latest.report?.verification?.test;

    return {
      specId: anchor.spec.id,
      workTitle: anchor.spec.title,
      workspace: anchor.spec.workspace_name,
      updatedAt: latest.history.completed_at ?? anchor.spec.focus_task_updated_at ?? "",
      patchVersion: latest.history.version,
      patchVersions: ordered.map(({ history }) => history.version),
      summary,
      decisions,
      learnings: allDecisions.slice(0, 3),
      improvements,
      verification: {
        total: test?.total,
        passed: test?.passed,
        failed: test?.failed,
        state: test?.state,
        runtimeVerified: latest.report?.verification?.runtimeVerified,
        validationVerdict: latest.report?.verification?.validationVerdict,
      },
    };
  }
  return null;
}
