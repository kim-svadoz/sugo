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
 * §10 계약테스트 실행증거: "구현 전 red→green 전이"를 review_done이 요구한다(자기보고 승격 차단).
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
