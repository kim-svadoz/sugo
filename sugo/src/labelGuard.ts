import type { ContractTestRecord } from "./contractEvidence.js";
import { fail, ok, type GateCheckResult } from "./gates.js";

/**
 * §4.6 label-guard: "미검증 라벨"은 정직한 탈출구지만 남용하면 모든 게이트가 무력화된다.
 * 두 겹으로 방어한다 — (1) 라벨-모순 차단: 그린 증거가 있는데 환경부재류 라벨을 주장하면 거부.
 * (2) 완료등급 강등: 우회 라벨이 하나라도 누적되면 completionGrade를 unverified로 낮춘다(차단은 아님).
 */
export type BypassLabelKind =
  | "environmentAbsent"
  | "runtimeUnverified"
  | "wiringUnverified"
  | "bootUnverified"
  | "contractEvidenceMissing"
  /**
   * §4.3-R `test_reverify`: test_done 시점에 찍힌 증거 스냅샷을 최신 증거로 다시 찍었다는 표시.
   * 환경부재류가 아니므로 라벨-모순 검사 대상이 아니다(그린 증거가 있어야 오히려 정상이다).
   * 다만 "한 번 확정된 판정을 사람이 다시 열었다"는 사실이므로 완료등급은 unverified로 낮춘다.
   */
  | "evidenceResnapshot"
  /**
   * §9-A 에이전트 체인 구간(CODE_RUNNING~REVIEW_RUNNING)에서 취소했다는 표시. 게이트를 통과해
   * 끝낸 것과 "여기까지 하고 접었다"는 다른 결말인데, 라벨이 없으면 둘을 구분할 수 없다.
   */
  | "abandonedChain"
  /**
   * §4.3-T TODO-SPEC 동기화 게이트를 우회했다는 표시. "이 브랜치/작업이 TODO-SPEC과 무관하다"는
   * 사유로만 쓴다 — 파일을 갱신하기 귀찮아서가 아니라, 정말 이 세션이 TODO-SPEC이 추적하는
   * 최종 목표와 무관한 작업(예: 핫픽스)이었을 때다.
   */
  | "todoSpecSyncSkipped";

export interface BypassLabel {
  kind: BypassLabelKind;
  reason: string;
  /** 이 라벨이 기록된 시점의 patch 버전(0=원본). 낡은 버전의 라벨이 이후 patch에 재사용되지 않게 스코프한다. */
  patchVersion: number;
  recordedAt: string;
}

export type CompletionGrade = "verified" | "unverified";

export interface GreenEvidenceInput {
  baselineExitCode?: number | null;
  testDerivedState?: string | null;
  contractTests?: ContractTestRecord[];
}

/**
 * 세션 안에 "실제로 그린이었다"는 실행 증거가 하나라도 있는지 판정한다(§4.6 모순 판정 근거).
 * 지금 평가 중인 라벨 자신의 증거는 호출부가 애초에 이 입력에서 제외해야 한다(순환 방지).
 */
export function hasGreenExecutionEvidence(input: GreenEvidenceInput): boolean {
  if (input.baselineExitCode === 0) return true;
  if (input.testDerivedState === "pass") return true;
  if (input.contractTests?.some((r) => r.greenExitCode === 0)) return true;
  return false;
}

/**
 * §4.6-1 라벨-모순 차단: 환경부재류 라벨을 주장하는데(claimsAbsent) 같은 세션에 이미 그린 실행
 * 증거가 있으면(hasGreenEvidence) 거짓 우회로 간주해 차단한다. claimsAbsent가 false면 애초에
 * 이 검사 대상이 아니므로 통과시킨다.
 */
export function detectLabelContradiction(claimsAbsent: boolean, hasGreenEvidence: boolean): GateCheckResult {
  if (!claimsAbsent) return ok();
  if (hasGreenEvidence) {
    return fail(
      "LABEL_CONTRADICTION",
      "이 세션에 그린 실행 증거가 이미 있는데 환경부재류 라벨을 주장했습니다 — 라벨-모순으로 거부합니다.",
    );
  }
  return ok();
}

/** 라벨이 기록된 patch 버전이 현재 patch 버전과 같을 때만 유효하다(낡은 예외 재사용 차단). */
export function isLabelStillInScope(labelPatchVersion: number, currentPatchVersion: number): boolean {
  return labelPatchVersion === currentPatchVersion;
}

/** 세션에 누적된 우회 라벨 중 현재 patch 버전 스코프 안에 있는 것만 걸러낸다. */
export function collectBypassLabels(labels: BypassLabel[], currentPatchVersion: number): BypassLabel[] {
  return labels.filter((l) => isLabelStillInScope(l.patchVersion, currentPatchVersion));
}

export interface CompletionGradeResult {
  grade: CompletionGrade;
  bypassLabels: BypassLabel[];
}

/** §4.6-2 완료등급 강등: 스코프 안 우회 라벨이 하나라도 있으면 unverified로 낮춘다(commit 자체는 차단 안 함). */
export function computeCompletionGrade(labels: BypassLabel[], currentPatchVersion: number): CompletionGradeResult {
  const inScope = collectBypassLabels(labels, currentPatchVersion);
  return { grade: inScope.length > 0 ? "unverified" : "verified", bypassLabels: inScope };
}

/** commit 응답에 강제 노출할 요약 텍스트를 렌더링한다("loud label" — 조용히 넘어가지 못하게). */
export function renderBypassSummary(result: CompletionGradeResult): string | undefined {
  if (result.grade === "verified") return undefined;
  const lines = result.bypassLabels.map((l) => `- [${l.kind}] ${l.reason}`);
  return `완료등급: unverified (우회 라벨 ${result.bypassLabels.length}건)\n${lines.join("\n")}`;
}
