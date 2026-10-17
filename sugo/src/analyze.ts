export interface RequirementMatch {
  id: string;
  keywords: string[];
  matchedKeywords: string[];
  score: 1 | 0.5 | 0;
  verdict: "pass" | "partial" | "fail";
}

export interface AnalyzeResult {
  verdict: "pass" | "partial" | "fail";
  requirements: RequirementMatch[];
}

const REQ_LINE_RE = /\bREQ-(\d+)\b\s*:?\s*(.*)$/gim;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "are", "was", "were", "from", "have", "has",
  "will", "should", "must", "can", "에서", "으로", "그리고", "합니다", "해야", "한다", "있다",
  "것을", "위해", "통해", "있어야",
]);

// 형태소 분석기 없이 최소한의 한국어 조사/어미를 떼어내는 휴리스틱 — 완벽한 스테밍이 아니라
// "이메일로"/"기능을" 같은 흔한 조사 결합형이 원형과 매칭되게 하는 보수적 근사치다.
const TRAILING_PARTICLES = ["으로", "에서", "까지", "부터", "이라는", "라는", "은", "는", "이", "가", "을", "를", "의", "에", "로"];
const VERB_SUFFIXES = ["해야한다", "합니다", "한다", "됩니다", "된다", "이다", "입니다", "해야"];

function stripTrailing(tok: string, suffixes: string[]): string {
  for (const suf of suffixes) {
    if (tok.endsWith(suf) && tok.length - suf.length >= 2) return tok.slice(0, -suf.length);
  }
  return tok;
}

function tokenize(text: string): string[] {
  const raw = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const seen = new Set<string>();
  for (const tok of raw) {
    let lower = tok.toLowerCase();
    if (lower.length < 2) continue;
    if (STOPWORDS.has(lower)) continue;
    lower = stripTrailing(lower, TRAILING_PARTICLES);
    lower = stripTrailing(lower, VERB_SUFFIXES);
    if (lower.length < 2) continue;
    if (STOPWORDS.has(lower)) continue;
    seen.add(lower);
  }
  return Array.from(seen);
}

/** PRD 본문에서 REQ-N 태그 라인을 추출해 요구사항별 키워드 집합을 만든다. 같은 id는 첫 등장만 사용. */
export function extractRequirements(prdContent: string): { id: string; keywords: string[] }[] {
  const results: { id: string; keywords: string[] }[] = [];
  const seenIds = new Set<string>();
  const re = new RegExp(REQ_LINE_RE);
  let m: RegExpExecArray | null;
  while ((m = re.exec(prdContent)) !== null) {
    const id = `REQ-${m[1]}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    results.push({ id, keywords: tokenize(m[2] ?? "") });
  }
  return results;
}

/**
 * 순수 함수: PRD의 REQ-* 단어가 변경 파일 문자열에 등장하는지만 대조한다.
 * 의미 동치, 번역, 동작 충족 여부는 판정하지 않는다. 따라서 결과는 비차단 탐색 신호다.
 * score 1.0(전부 일치)=pass, 0.5(일부 일치)=partial, 0(불일치)=fail이다.
 * 키워드가 0개인 요구사항은 비교할 항목이 없으므로 pass로 표시한다.
 */
export function analyzePrdMatch(prdContent: string, fileContents: string[]): AnalyzeResult {
  const requirements = extractRequirements(prdContent);
  const combinedLower = fileContents.join("\n").toLowerCase();

  const results: RequirementMatch[] = requirements.map((req) => {
    if (req.keywords.length === 0) {
      return { id: req.id, keywords: req.keywords, matchedKeywords: [], score: 1, verdict: "pass" };
    }
    const matched = req.keywords.filter((kw) => combinedLower.includes(kw));
    const ratio = matched.length / req.keywords.length;
    const score: 1 | 0.5 | 0 = ratio === 1 ? 1 : ratio > 0 ? 0.5 : 0;
    const verdict = score === 1 ? "pass" : score === 0.5 ? "partial" : "fail";
    return { id: req.id, keywords: req.keywords, matchedKeywords: matched, score, verdict };
  });

  const verdict: AnalyzeResult["verdict"] =
    results.length === 0
      ? "fail"
      : results.every((r) => r.verdict === "pass")
        ? "pass"
        : results.every((r) => r.verdict === "fail")
          ? "fail"
          : "partial";

  return { verdict, requirements: results };
}
