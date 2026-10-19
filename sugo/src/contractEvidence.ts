import { fail, ok, type GateCheckResult } from "./gates.js";

export type ContractPhase = "red" | "green";

export interface ContractTestRecord {
  contractId: string;
  redRecordedAt?: string;
  redExitCode?: number;
  greenRecordedAt?: string;
  greenExitCode?: number;
}

/** 순수 함수: 기존 레코드에 red 또는 green 단계 기록을 병합한다(같은 contractId의 다른 단계는 보존). */
export function applyContractPhase(
  existing: ContractTestRecord | undefined,
  contractId: string,
  phase: ContractPhase,
  exitCode: number,
  now: string,
): ContractTestRecord {
  const base: ContractTestRecord = existing ?? { contractId };
  if (phase === "red") return { ...base, contractId, redRecordedAt: now, redExitCode: exitCode };
  return { ...base, contractId, greenRecordedAt: now, greenExitCode: exitCode };
}

/** red 단계가 실제로 실패(exitCode!==0)했고, green 단계가 실제로 통과(exitCode===0)해야 진짜 전이. */
function isValidRedToGreenTransition(r: ContractTestRecord): boolean {
  return r.redExitCode !== undefined && r.redExitCode !== 0 && r.greenExitCode === 0;
}

/**
 * 계약테스트 실행증거: "구현 전 red→green 전이"를 review_done이 요구한다(자기보고 승격 차단).
 * green만 있고 red가 없으면(테스트를 구현 후에 작성해 처음부터 통과) 거부, red의 exitCode가 0이면
 * (애초에 실패하지 않았다 — 가짜 red) 거부, green의 exitCode가 0이 아니면(실제로 안 통과) 거부.
 * required=false(opt-in 꺼짐)면 no-op 통과.
 */
export function checkContractEvidenceGate(records: ContractTestRecord[], required: boolean): GateCheckResult {
  if (!required) return ok();
  if (records.length === 0) {
    return fail("CONTRACT_EVIDENCE_MISSING", "계약테스트 실행증거(red→green)가 하나도 기록되지 않았습니다.");
  }
  const invalid = records.filter((r) => !isValidRedToGreenTransition(r));
  if (invalid.length > 0) {
    return fail(
      "CONTRACT_EVIDENCE_INCOMPLETE",
      `red→green 전이가 확인되지 않은 계약: ${invalid.map((r) => r.contractId).join(", ")}`,
    );
  }
  return ok();
}

/** red 단계가 실제로 실패(exitCode!==0)했는지만 확인한다 — green(구현 후 통과)까지는 아직 요구하지 않는다. */
function hasValidRed(r: ContractTestRecord): boolean {
  return r.redExitCode !== undefined && r.redExitCode !== 0;
}

/**
 * contract_done 상태게이트: "구현 전 red 확인 없이 contract_done 진입"을 막는다(자기보고 승격
 * 차단의 앞단계 — review_done의 checkContractEvidenceGate는 나중에 red→green 전이 전체를 재검증한다).
 * required=false(정책 off/휴리스틱 off)면 no-op 통과. environmentAbsentReason이 있으면(테스트 자체를
 * 실행할 환경이 없음) 라벨로 우회한다 — 이 우회는 호출부가 label-guard로 모순 여부를 먼저
 * 검사해야 한다.
 */
export function checkContractStartedGate(
  records: ContractTestRecord[],
  required: boolean,
  environmentAbsentReason?: string,
): GateCheckResult {
  if (!required) return ok();
  if (environmentAbsentReason && environmentAbsentReason.trim().length > 0) return ok();
  if (!records.some(hasValidRed)) {
    return fail(
      "CONTRACT_NOT_STARTED",
      "계약테스트가 필수인데 구현 전 red 확인(sugo_record_contract_evidence phase=red)이 없습니다.",
    );
  }
  return ok();
}

/**
 * "undefined면 기본-on 휴리스틱": 정책이 명시적으로 설정돼 있으면 그 값을 그대로
 * 따른다. 정책이 아예 설정 안 된 프로젝트(policyValue===undefined)는 PRD가 이미 baseline 위험
 * 시그널을 가진 경우에만 계약증거도 함께 기본 강제한다 — 같은 위험판단 신호를 재사용해
 * "평범한 PRD엔 영향 없음(하위호환 유지) + 위험 변경엔 자동으로 더 엄격해짐"을 동시에 만족시킨다.
 */
export function resolveContractRequired(policyValue: boolean | undefined, sessionCtx: { baselineRequired: boolean }): boolean {
  if (policyValue !== undefined) return policyValue;
  return sessionCtx.baselineRequired;
}
