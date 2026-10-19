export type RouteAgent = "code-agent" | "test-agent" | "review-agent" | "docs-agent";

export interface RouteRule {
  agent: RouteAgent;
  skill: string;
  triggers: string[];
  negative?: string[];
  priority: number;
}

export interface RouteMatch {
  agent: RouteAgent;
  skill: string;
  triggers_matched: string[];
}

export interface RouteResult {
  matched: boolean;
  route?: RouteMatch;
  alternatives?: RouteMatch[];
}

/**
 * 트리거 라우터 최소셋: code(implement/bugfix/refactor) · test(targeted+full)
 * · review(validate+security) · docs(readme)만 구현한다. priority가 높을수록 우선(동률이면 이
 * 배열의 앞쪽이 우선 — 그래서 더 구체적인 규칙을 먼저/더 높은 priority로 둔다).
 */
export const ROUTES: RouteRule[] = [
  {
    agent: "test-agent",
    skill: "full",
    triggers: ["전체 테스트", "전량 테스트", "모든 테스트", "run all tests", "full test"],
    priority: 12,
  },
  {
    agent: "review-agent",
    skill: "security",
    triggers: ["보안", "취약점", "security", "vulnerability", "owasp"],
    priority: 12,
  },
  {
    agent: "code-agent",
    skill: "bugfix",
    triggers: ["버그", "에러", "오류", "고쳐줘", "고쳐", "bug", "fix", "error"],
    negative: ["테스트", "문서", "리팩토링", "test", "docs", "refactor"],
    priority: 10,
  },
  {
    agent: "code-agent",
    skill: "refactor",
    triggers: ["리팩토링", "refactor", "정리해줘", "구조 개선"],
    priority: 10,
  },
  {
    agent: "test-agent",
    skill: "targeted",
    triggers: ["테스트 추가", "테스트 작성", "테스트해줘", "add test", "write test"],
    priority: 10,
  },
  {
    agent: "review-agent",
    skill: "validate",
    triggers: ["리뷰해줘", "검토해줘", "코드리뷰", "review"],
    negative: ["보안", "security"],
    priority: 10,
  },
  {
    agent: "docs-agent",
    skill: "readme",
    triggers: ["문서화", "문서 작성", "readme", "docs"],
    priority: 10,
  },
  {
    agent: "code-agent",
    skill: "implement",
    triggers: ["구현해줘", "추가해줘", "기능 추가", "만들어줘", "implement", "add feature"],
    priority: 5,
  },
];

function matchRule(rule: RouteRule, normalizedInput: string): RouteMatch | null {
  if (rule.negative?.some((n) => normalizedInput.includes(n.toLowerCase()))) return null;
  const matched = rule.triggers.filter((t) => normalizedInput.includes(t.toLowerCase()));
  if (matched.length === 0) return null;
  return { agent: rule.agent, skill: rule.skill, triggers_matched: matched };
}

/** 순수 함수: 자연어 입력을 (agent, skill)로 라우팅한다. 매칭 없으면 matched:false. */
export function routeInput(input: string): RouteResult {
  const normalized = input.toLowerCase();
  const matches: { rule: RouteRule; match: RouteMatch }[] = [];
  for (const rule of ROUTES) {
    const match = matchRule(rule, normalized);
    if (match) matches.push({ rule, match });
  }
  if (matches.length === 0) return { matched: false };

  matches.sort((a, b) => b.rule.priority - a.rule.priority);
  const [best, ...rest] = matches;
  return {
    matched: true,
    route: best.match,
    alternatives: rest.length > 0 ? rest.map((m) => m.match) : undefined,
  };
}
