import { describe, expect, it } from "vitest";
import { checkTestEvidenceGate, deriveTestState, makeTestEvidenceRecord } from "../src/testEvidence.js";

describe("deriveTestState", () => {
  it("exitCode 0 + failed 0 -> pass", () => {
    expect(deriveTestState({ command: "npm test", exitCode: 0, failed: 0 })).toBe("pass");
  });

  it("exitCode 0인데 failed>0이면 fail(테스트 러너가 exitCode를 잘못 반환하는 경우 방어)", () => {
    expect(deriveTestState({ command: "npm test", exitCode: 0, failed: 2 })).toBe("fail");
  });

  it("exitCode !== 0이면 fail", () => {
    expect(deriveTestState({ command: "npm test", exitCode: 1 })).toBe("fail");
  });

  it("unverified 플래그가 있으면 exitCode와 무관하게 unverified", () => {
    expect(deriveTestState({ command: "npm test", exitCode: 0, unverified: true })).toBe("unverified");
  });

  it("exitCode가 아예 없으면 안전측 unverified", () => {
    expect(deriveTestState({ command: "npm test" })).toBe("unverified");
  });
});

describe("checkTestEvidenceGate — 설계안: 반드시 거부", () => {
  it("testPassed:true인데 record_test_evidence 자체가 없으면 거부한다", () => {
    const result = checkTestEvidenceGate(true, null);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("TEST_EVIDENCE_MISSING");
  });

  it("기록이 failed>0인데 testPassed:true 주장이면 거부한다", () => {
    const evidence = makeTestEvidenceRecord("feature", { command: "npm test", exitCode: 1, failed: 3 }, "2026-01-01T00:00:00.000Z");
    const result = checkTestEvidenceGate(true, evidence);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("TEST_EVIDENCE_MISMATCH");
  });

  it("기록이 pass인데 testPassed:false로 축소보고해도 불일치로 거부한다", () => {
    const evidence = makeTestEvidenceRecord("feature", { command: "npm test", exitCode: 0, failed: 0 }, "2026-01-01T00:00:00.000Z");
    const result = checkTestEvidenceGate(false, evidence);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("TEST_EVIDENCE_MISMATCH");
  });
});

describe("checkTestEvidenceGate — 반드시 허용", () => {
  it("기록 exitCode==0이고 testPassed:true 주장이 일치하면 통과", () => {
    const evidence = makeTestEvidenceRecord("feature", { command: "npm test", exitCode: 0, failed: 0 }, "2026-01-01T00:00:00.000Z");
    expect(checkTestEvidenceGate(true, evidence).ok).toBe(true);
  });

  it("기록 fail이고 testPassed:false 주장이 일치하면 통과(auto-loop로 재시도하게 됨)", () => {
    const evidence = makeTestEvidenceRecord("feature", { command: "npm test", exitCode: 1, failed: 2 }, "2026-01-01T00:00:00.000Z");
    expect(checkTestEvidenceGate(false, evidence).ok).toBe(true);
  });

  it("unverified 기록이면 claim과 무관하게 통과한다(환경부재 라벨)", () => {
    const evidence = makeTestEvidenceRecord("feature", { command: "npm test", unverified: true, unverifiedReason: "샌드박스에 런타임 없음" }, "2026-01-01T00:00:00.000Z");
    expect(checkTestEvidenceGate(true, evidence).ok).toBe(true);
    expect(checkTestEvidenceGate(false, evidence).ok).toBe(true);
  });
});
