import type { CheckSeverity, HarnessValidationConfig } from "./harness/validationConfig.js";

export interface SubmittedCheckResult {
  harnessId: string;
  checkId: string;
  passed: boolean;
  note?: string;
}

export interface ResolvedCheckResult extends SubmittedCheckResult {
  severity: CheckSeverity;
  /** verified = 서버가 직접 확인함(auto), self-reported = 에이전트 주장 그대로. */
  source: "verified" | "self-reported";
  /** verified인 경우 서버가 왜 그렇게 판정했는지. */
  detail?: string;
}

/** 서버가 auto 체크를 실제로 돌려서 얻은 결과. 키는 `${harnessId}#${checkId}`. */
export interface AutoVerifiedResult {
  harnessId: string;
  checkId: string;
  passed: boolean;
  detail: string;
}

/** 에이전트 주장과 서버 실측이 어긋난 지점 — 자기보고를 믿을 수 없다는 직접 증거다. */
export interface ClaimContradiction {
  harnessId: string;
  checkId: string;
  claimed: boolean;
  verified: boolean;
  detail: string;
}

export interface ValidationVerdict {
  verdict: "pass" | "partial" | "fail";
  results: ResolvedCheckResult[];
  /** 프로젝트에 실제 정의되지 않은 (harnessId, checkId)를 보고한 항목 — 신뢰하지 않고 판정에서 제외한다. */
  fabricated: SubmittedCheckResult[];
  /** 정의는 됐지만 이번 제출에 아예 보고되지 않은 항목(참고용, 판정에 영향 없음). auto 체크는 제외 — 서버가 항상 본다. */
  uncoveredChecks: { harnessId: string; checkId: string }[];
  /** 주장과 실측이 어긋난 항목. 판정은 실측을 따른다. */
  contradictions: ClaimContradiction[];
}

/**
 * 순수 함수: review-agent가 제출한 검증 결과를 실제 프로젝트에 정의된 validation.yaml과 대조한다.
 * 존재하지 않는 checkId를 보고하면(할루시네이션이든 고의적 조작이든) fabricated로 분리해
 * 판정에서 배제한다 — "존재하지 않는 규칙을 통과했다고 우기는" 방식의 거짓 그린을 차단한다.
 * severity=error가 하나라도 실패면 fail, 그 외 severity=warning 실패가 있으면 partial, 전부
 * 통과면 pass.
 */
export function computeValidationVerdict(
  submitted: SubmittedCheckResult[],
  definedConfigs: Map<string, HarnessValidationConfig>,
  autoResults: Map<string, AutoVerifiedResult> = new Map(),
): ValidationVerdict {
  const results: ResolvedCheckResult[] = [];
  const fabricated: SubmittedCheckResult[] = [];
  const contradictions: ClaimContradiction[] = [];
  const claimByKey = new Map<string, SubmittedCheckResult>();

  for (const item of submitted) {
    const config = definedConfigs.get(item.harnessId);
    const check = config?.checks.find((c) => c.id === item.checkId);
    if (!check) {
      fabricated.push(item);
      continue;
    }
    const key = `${item.harnessId}#${item.checkId}`;
    claimByKey.set(key, item);
    // auto 체크는 아래에서 실측으로 채운다 — 주장은 모순 대조용으로만 쓴다.
    if (!autoResults.has(key)) results.push({ ...item, severity: check.severity, source: "self-reported" });
  }

  // 실측 결과를 싣는다. 제출 여부와 무관하게 서버가 돌린 것이므로 "제출 안 하면 통과"가 성립하지 않는다.
  for (const [key, verified] of autoResults) {
    const check = definedConfigs.get(verified.harnessId)?.checks.find((c) => c.id === verified.checkId);
    if (!check) continue;
    results.push({
      harnessId: verified.harnessId,
      checkId: verified.checkId,
      passed: verified.passed,
      severity: check.severity,
      source: "verified",
      detail: verified.detail,
    });
    const claim = claimByKey.get(key);
    if (claim && claim.passed !== verified.passed) {
      contradictions.push({
        harnessId: verified.harnessId,
        checkId: verified.checkId,
        claimed: claim.passed,
        verified: verified.passed,
        detail: verified.detail,
      });
    }
  }

  const uncoveredChecks: { harnessId: string; checkId: string }[] = [];
  for (const [harnessId, config] of definedConfigs) {
    for (const check of config.checks) {
      const reported = results.some((r) => r.harnessId === harnessId && r.checkId === check.id);
      if (!reported) uncoveredChecks.push({ harnessId, checkId: check.id });
    }
  }

  const failedErrors = results.filter((r) => !r.passed && r.severity === "error");
  const failedWarnings = results.filter((r) => !r.passed && r.severity === "warning");

  const verdict: ValidationVerdict["verdict"] =
    failedErrors.length > 0 ? "fail" : failedWarnings.length > 0 ? "partial" : "pass";

  return { verdict, results, fabricated, uncoveredChecks, contradictions };
}
