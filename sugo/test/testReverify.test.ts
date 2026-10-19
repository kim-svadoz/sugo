import { describe, expect, it } from "vitest";
import { checkTestReverifyGate } from "../src/testReverify.js";
import type { TestEvidenceRecord } from "../src/testEvidence.js";

function evidence(derivedState: TestEvidenceRecord["derivedState"]): TestEvidenceRecord {
  return {
    command: "./gradlew test",
    exitCode: derivedState === "pass" ? 0 : 1,
    kind: "feature",
    recordedAt: "2026-09-21T00:00:00.000Z",
    derivedState,
  } as TestEvidenceRecord;
}

describe("checkTestReverifyGate — 재스냅샷 전제 검사", () => {
  it("그린 증거 + 사유가 있으면 통과한다", () => {
    expect(checkTestReverifyGate(evidence("pass"), "전체 스위트에 무관한 사전 결함이 섞여 범위를 좁혀 재실행")).toEqual({ ok: true });
  });

  it("증거 자체가 없으면 거부한다", () => {
    const r = checkTestReverifyGate(undefined, "사유");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("REVERIFY_NO_EVIDENCE");
  });

  it("사유가 없으면 거부한다 — 왜 옛 판정이 틀렸는지 남아야 한다", () => {
    expect(checkTestReverifyGate(evidence("pass"), undefined).code).toBe("REVERIFY_REASON_REQUIRED");
  });

  it("사유가 공백뿐이면 거부한다", () => {
    expect(checkTestReverifyGate(evidence("pass"), "   ").code).toBe("REVERIFY_REASON_REQUIRED");
  });

  it("최신 증거도 fail이면 거부한다 — 재스냅샷해도 판정이 안 바뀐다", () => {
    const r = checkTestReverifyGate(evidence("fail"), "사유");
    expect(r.ok).toBe(false);
    expect(r.code).toBe("REVERIFY_EVIDENCE_STILL_FAIL");
  });

  it("unverified 증거는 통과시킨다 — fail이 아니면 스냅샷을 갱신할 수 있다", () => {
    // 환경부재로 unverified가 된 경우, 재스냅샷 후 review_done에서 라벨로 다시 걸린다.
    // 여기서 이중으로 막으면 정상 경로까지 닫힌다.
    expect(checkTestReverifyGate(evidence("unverified"), "사유").ok).toBe(true);
  });
});
