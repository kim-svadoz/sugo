import type { CheckSeverity, HarnessValidationConfig } from "./harness/validationConfig.js";

export interface SubmittedCheckResult {
  harnessId: string;
  checkId: string;
  passed: boolean;
  note?: string;
}

export interface ResolvedCheckResult extends SubmittedCheckResult {
  severity: CheckSeverity;
}

export interface ValidationVerdict {
  verdict: "pass" | "partial" | "fail";
  results: ResolvedCheckResult[];
  /** 프로젝트에 실제 정의되지 않은 (harnessId, checkId)를 보고한 항목 — 신뢰하지 않고 판정에서 제외한다. */
  fabricated: SubmittedCheckResult[];
  /** 정의는 됐지만 이번 제출에 아예 보고되지 않은 항목(참고용, 판정에 영향 없음). */
  uncoveredChecks: { harnessId: string; checkId: string }[];
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
): ValidationVerdict {
  const results: ResolvedCheckResult[] = [];
  const fabricated: SubmittedCheckResult[] = [];

  for (const item of submitted) {
    const config = definedConfigs.get(item.harnessId);
    const check = config?.checks.find((c) => c.id === item.checkId);
    if (!check) {
      fabricated.push(item);
      continue;
    }
    results.push({ ...item, severity: check.severity });
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

  return { verdict, results, fabricated, uncoveredChecks };
}
