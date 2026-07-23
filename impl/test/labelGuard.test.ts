import { describe, expect, it } from "vitest";
import {
  collectBypassLabels,
  computeCompletionGrade,
  detectLabelContradiction,
  hasGreenExecutionEvidence,
  isLabelStillInScope,
  renderBypassSummary,
  type BypassLabel,
} from "../src/labelGuard.js";

describe("hasGreenExecutionEvidence", () => {
  it("baselineExitCode==0이면 그린 증거로 판정한다", () => {
    expect(hasGreenExecutionEvidence({ baselineExitCode: 0 })).toBe(true);
  });
  it("testDerivedState==='pass'면 그린 증거로 판정한다", () => {
    expect(hasGreenExecutionEvidence({ testDerivedState: "pass" })).toBe(true);
  });
  it("contractTests에 greenExitCode==0인 레코드가 있으면 그린 증거로 판정한다", () => {
    expect(hasGreenExecutionEvidence({ contractTests: [{ contractId: "c1", greenExitCode: 0 }] })).toBe(true);
  });
  it("아무 증거도 없으면 false", () => {
    expect(hasGreenExecutionEvidence({})).toBe(false);
    expect(hasGreenExecutionEvidence({ baselineExitCode: 1, testDerivedState: "fail" })).toBe(false);
  });
});

describe("§4.6 label-guard 코퍼스 — 라벨-모순(detectLabelContradiction) 반드시 거부", () => {
  it("그린 증거 있는데 environmentAbsent류 라벨 주장 시 차단된다", () => {
    const result = detectLabelContradiction(true, true);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("LABEL_CONTRADICTION");
  });
});

describe("§4.6 label-guard 코퍼스 — 반드시 허용", () => {
  it("실제 환경부재(그린 증거 없음)면 라벨을 그대로 허용한다", () => {
    expect(detectLabelContradiction(true, false).ok).toBe(true);
  });
  it("애초에 환경부재 라벨을 주장하지 않으면 그린 증거 여부와 무관하게 통과한다", () => {
    expect(detectLabelContradiction(false, true).ok).toBe(true);
    expect(detectLabelContradiction(false, false).ok).toBe(true);
  });
});

describe("environmentAbsentVersion 스코핑", () => {
  it("같은 patch 버전의 라벨만 유효하다", () => {
    expect(isLabelStillInScope(0, 0)).toBe(true);
    expect(isLabelStillInScope(1, 1)).toBe(true);
  });
  it("낡은 patch 버전의 라벨은 현재 버전에 재사용되지 않는다", () => {
    expect(isLabelStillInScope(0, 1)).toBe(false);
    expect(isLabelStillInScope(1, 2)).toBe(false);
  });
});

function label(kind: BypassLabel["kind"], patchVersion: number): BypassLabel {
  return { kind, reason: "테스트 사유", patchVersion, recordedAt: "2026-01-01T00:00:00.000Z" };
}

describe("collectBypassLabels", () => {
  it("현재 patch 버전 스코프 밖의 라벨은 걸러낸다", () => {
    const labels = [label("bootUnverified", 0), label("runtimeUnverified", 1)];
    expect(collectBypassLabels(labels, 1)).toHaveLength(1);
    expect(collectBypassLabels(labels, 1)[0].kind).toBe("runtimeUnverified");
  });
});

describe("computeCompletionGrade", () => {
  it("우회 라벨이 없으면 verified", () => {
    const result = computeCompletionGrade([], 0);
    expect(result.grade).toBe("verified");
    expect(result.bypassLabels).toHaveLength(0);
  });
  it("스코프 안 우회 라벨이 하나라도 있으면 unverified로 강등한다", () => {
    const result = computeCompletionGrade([label("environmentAbsent", 0)], 0);
    expect(result.grade).toBe("unverified");
    expect(result.bypassLabels).toHaveLength(1);
  });
  it("낡은 버전 라벨만 있으면(현재 스코프 밖) verified로 유지한다", () => {
    const result = computeCompletionGrade([label("bootUnverified", 0)], 1);
    expect(result.grade).toBe("verified");
  });
});

describe("renderBypassSummary", () => {
  it("verified면 undefined(리포트에 노출 안 함)", () => {
    expect(renderBypassSummary({ grade: "verified", bypassLabels: [] })).toBeUndefined();
  });
  it("unverified면 각 라벨을 리포트 텍스트로 노출한다", () => {
    const text = renderBypassSummary({ grade: "unverified", bypassLabels: [label("wiringUnverified", 0)] });
    expect(text).toContain("unverified");
    expect(text).toContain("wiringUnverified");
    expect(text).toContain("테스트 사유");
  });
});
