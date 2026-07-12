import { describe, expect, it } from "vitest";
import { applyContractPhase, checkContractEvidenceGate, type ContractTestRecord } from "../src/contractEvidence.js";

describe("applyContractPhase", () => {
  it("red 기록 후 green 기록해도 red 정보를 보존한다", () => {
    let record = applyContractPhase(undefined, "C-1", "red", 1, "t1");
    record = applyContractPhase(record, "C-1", "green", 0, "t2");
    expect(record.redExitCode).toBe(1);
    expect(record.greenExitCode).toBe(0);
    expect(record.redRecordedAt).toBe("t1");
    expect(record.greenRecordedAt).toBe("t2");
  });
});

describe("checkContractEvidenceGate — required=false는 no-op", () => {
  it("기록이 없어도 통과한다", () => {
    expect(checkContractEvidenceGate([], false).ok).toBe(true);
  });
});

describe("checkContractEvidenceGate — 반드시 거부(자기보고 승격 차단)", () => {
  it("기록이 하나도 없으면 거부한다", () => {
    const result = checkContractEvidenceGate([], true);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("CONTRACT_EVIDENCE_MISSING");
  });

  it("green만 있고 red가 없으면 거부한다(구현 후 테스트 작성 — 순환검증)", () => {
    const records: ContractTestRecord[] = [{ contractId: "C-1", greenExitCode: 0, greenRecordedAt: "t" }];
    const result = checkContractEvidenceGate(records, true);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("CONTRACT_EVIDENCE_INCOMPLETE");
  });

  it("red의 exitCode가 0이면(가짜 red — 애초에 실패 안 함) 거부한다", () => {
    const records: ContractTestRecord[] = [
      { contractId: "C-1", redExitCode: 0, redRecordedAt: "t1", greenExitCode: 0, greenRecordedAt: "t2" },
    ];
    const result = checkContractEvidenceGate(records, true);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("CONTRACT_EVIDENCE_INCOMPLETE");
  });

  it("green의 exitCode가 0이 아니면(실제로 안 통과) 거부한다", () => {
    const records: ContractTestRecord[] = [
      { contractId: "C-1", redExitCode: 1, redRecordedAt: "t1", greenExitCode: 1, greenRecordedAt: "t2" },
    ];
    const result = checkContractEvidenceGate(records, true);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("CONTRACT_EVIDENCE_INCOMPLETE");
  });

  it("여러 계약 중 하나라도 미완성이면 전체 거부한다", () => {
    const records: ContractTestRecord[] = [
      { contractId: "C-1", redExitCode: 1, greenExitCode: 0 },
      { contractId: "C-2", greenExitCode: 0 }, // red 없음
    ];
    const result = checkContractEvidenceGate(records, true);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("C-2");
  });
});

describe("checkContractEvidenceGate — 반드시 허용", () => {
  it("모든 계약이 red(≠0)→green(0) 전이를 완료했으면 통과한다", () => {
    const records: ContractTestRecord[] = [
      { contractId: "C-1", redExitCode: 1, redRecordedAt: "t1", greenExitCode: 0, greenRecordedAt: "t2" },
      { contractId: "C-2", redExitCode: 2, redRecordedAt: "t3", greenExitCode: 0, greenRecordedAt: "t4" },
    ];
    expect(checkContractEvidenceGate(records, true).ok).toBe(true);
  });
});
