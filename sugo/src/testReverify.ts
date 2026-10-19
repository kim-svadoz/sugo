import type { GateCheckResult } from "./gates.js";
import type { TestEvidenceRecord } from "./testEvidence.js";

/**
 * `test_reverify` — test_done이 찍은 증거 스냅샷을 최신 증거로 다시 찍는다.
 *
 * **왜 필요한가.** `test_done`은 그 시점의 `testEvidence.derivedState`를 `testPassedState`로
 * 박아두고, `review_done`은 최신 증거가 아니라 그 박제된 값을 본다. 그래서 fail 증거로
 * `test_done`을 지난 뒤 올바른 증거를 다시 기록해도 판정이 바뀌지 않고, forward-only라
 * `test_done`으로 되돌아갈 수도 없어 파이프라인이 완전히 막힌다.
 *
 * **게이트를 무르게 하지 않는다.** 스냅샷을 다시 찍을 뿐 판정 기준은 그대로다. 그리고 재스냅샷
 * 사실을 `evidenceResnapshot` 라벨로 남겨 완료등급이 unverified로 내려간다 — "한 번 확정된
 * 판정을 사람이 다시 열었다"는 건 조용히 넘어갈 일이 아니다.
 */
export function checkTestReverifyGate(evidence: TestEvidenceRecord | undefined, reason: string | undefined): GateCheckResult {
  if (!evidence) {
    return {
      ok: false,
      code: "REVERIFY_NO_EVIDENCE",
      message: "재스냅샷할 test evidence가 없습니다 — sugo_record_test_evidence로 먼저 기록하세요.",
    };
  }
  if (!reason || reason.trim().length === 0) {
    return {
      ok: false,
      code: "REVERIFY_REASON_REQUIRED",
      message:
        "test_reverify에는 reason이 필요합니다 — 왜 test_done 시점 판정이 틀렸는지 남겨야 합니다(예: '전체 스위트에 무관한 사전 결함이 섞여 범위를 좁혀 재실행').",
    };
  }
  if (evidence.derivedState === "fail") {
    return {
      ok: false,
      code: "REVERIFY_EVIDENCE_STILL_FAIL",
      message:
        "최신 증거도 fail입니다 — 재스냅샷해도 판정이 달라지지 않습니다. 실패를 먼저 해결하고 그린 증거를 기록하세요.",
    };
  }
  return { ok: true };
}
