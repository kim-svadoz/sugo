import { fail, ok, type GateCheckResult } from "./gates.js";

export type TestEvidenceKind = "baseline" | "feature";
export type TestPassedState = "pass" | "fail" | "unverified";

export interface TestEvidenceInput {
  command: string;
  exitCode?: number;
  total?: number;
  passed?: number;
  failed?: number;
  unverified?: boolean;
  unverifiedReason?: string;
}

export interface TestEvidenceRecord extends TestEvidenceInput {
  kind: TestEvidenceKind;
  recordedAt: string;
  derivedState: TestPassedState;
}

/**
 * exitCode/failed로부터 pass|fail|unverified를 판정한다 — 조작 방지 핵심: 이 값이 test_done의
 * "claim"과 대조되는 서버측 진실이다. exitCode가 아예 없으면 판정불가로 안전측 unverified.
 */
export function deriveTestState(input: TestEvidenceInput): TestPassedState {
  if (input.unverified) return "unverified";
  if (input.exitCode === undefined) return "unverified";
  if (input.exitCode === 0 && (input.failed ?? 0) === 0) return "pass";
  return "fail";
}

export function makeTestEvidenceRecord(kind: TestEvidenceKind, input: TestEvidenceInput, recordedAt: string): TestEvidenceRecord {
  return { ...input, kind, recordedAt, derivedState: deriveTestState(input) };
}

/**
 * test_done(claimedTestPassed)이 실제 기록된 증거와 일치하는지 대조한다(§4.2, 조작 방지).
 * evidence가 아예 없으면 "기록 없이 통과 주장"으로 거부, derivedState가 unverified면 환경부재
 * 선언으로 보고 claim과 무관하게 통과시킨다(교착 방지 — unverified는 auto-loop 무한재시도 방지용).
 */
export function checkTestEvidenceGate(claimedTestPassed: boolean, evidence: TestEvidenceRecord | null): GateCheckResult {
  if (!evidence) {
    return fail("TEST_EVIDENCE_MISSING", "test_done 전에 sugo_record_test_evidence로 실행 증거를 기록해야 합니다.");
  }
  if (evidence.derivedState === "unverified") return ok();
  const actuallyPassed = evidence.derivedState === "pass";
  if (claimedTestPassed !== actuallyPassed) {
    return fail(
      "TEST_EVIDENCE_MISMATCH",
      `testPassed 주장(${claimedTestPassed})이 기록된 증거(${evidence.derivedState}, exitCode=${evidence.exitCode}, failed=${evidence.failed ?? "?"})와 일치하지 않습니다.`,
    );
  }
  return ok();
}
