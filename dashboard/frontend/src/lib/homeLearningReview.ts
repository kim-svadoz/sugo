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
    .map((value) => /개수 없는 조회와\s+LIMITED_RESULT(?:는|를)?\s*제거/.test(value)
      ? "page_size 없이 호출하던 미사용 조회 경로와 LIMITED_RESULT 분기를 제거해, 조회 계약을 page_size 기준 하나로 단순화했다."
      : value)
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
  if (decisions.some((value) => /메서드|\w+\([^)]*\)|LIMITED_RESULT|오버로드/.test(value))) {
    learnings.push("호출 경로가 하나라면 메서드 계약도 하나로 유지하고, 사용되지 않는 변형 API는 제거한다.");
  }
  if (decisions.some((value) => /Mapper|Assembler|DTO|record|interface/.test(value))) {
    learnings.push("문서 구조가 같으면 변환 책임은 기존 Mapper/Assembler 경계에 유지하고 중복 변환 코드를 만들지 않는다.");
  }
  return learnings.slice(0, 3);
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
      const result = embedded ?? ((focused?.report?.patchVersion ?? focused?.patchVersion) === history.version ? focused : null);
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
      learnings: learningCandidates(allDecisions),
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
