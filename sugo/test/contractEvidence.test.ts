import { describe, expect, it } from "vitest";
import {
  applyContractPhase,
  checkContractEvidenceGate,
  checkContractStartedGate,
  resolveContractRequired,
  type ContractTestRecord,
} from "../src/contractEvidence.js";

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

describe("contract_done — checkContractStartedGate 반드시 거부", () => {
  it("계약필수인데 구현 전 red 확인 없이 contract_done을 호출하면 거부한다", () => {
    const result = checkContractStartedGate([], true);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("CONTRACT_NOT_STARTED");
  });

  it("green만 있고 red가 없으면 여전히 거부한다(red 확인 자체가 없으므로)", () => {
    const records: ContractTestRecord[] = [{ contractId: "C-1", greenExitCode: 0 }];
    const result = checkContractStartedGate(records, true);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("CONTRACT_NOT_STARTED");
  });

  it("red의 exitCode가 0이면(가짜 red) 여전히 거부한다", () => {
    const records: ContractTestRecord[] = [{ contractId: "C-1", redExitCode: 0 }];
    const result = checkContractStartedGate(records, true);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("CONTRACT_NOT_STARTED");
  });
});

describe("contract_done — checkContractStartedGate 반드시 허용", () => {
  it("계약 불필요(정책 off)면 red 확인 없이도 통과한다", () => {
    expect(checkContractStartedGate([], false).ok).toBe(true);
  });

  it("test-first red가 기록돼 있으면 통과한다(green은 아직 없어도 됨)", () => {
    const records: ContractTestRecord[] = [{ contractId: "C-1", redExitCode: 1 }];
    expect(checkContractStartedGate(records, true).ok).toBe(true);
  });

  it("environmentAbsentReason 라벨로 우회할 수 있다", () => {
    const result = checkContractStartedGate([], true, "샌드박스에 테스트 러너 없음");
    expect(result.ok).toBe(true);
  });
});

describe("resolveContractRequired — undefined면 기본-on 휴리스틱", () => {
  it("정책이 명시적으로 true면 그대로 강제한다", () => {
    expect(resolveContractRequired(true, { baselineRequired: false })).toBe(true);
  });

  it("정책이 명시적으로 false면 baseline 시그널과 무관하게 해제한다", () => {
    expect(resolveContractRequired(false, { baselineRequired: true })).toBe(false);
  });

  it("정책 미설정 + baseline 위험시그널 없음(평범한 PRD) → 하위호환으로 off 유지", () => {
    expect(resolveContractRequired(undefined, { baselineRequired: false })).toBe(false);
  });

  it("정책 미설정 + baseline 위험시그널 있음(위험한 PRD) → 기본-on", () => {
    expect(resolveContractRequired(undefined, { baselineRequired: true })).toBe(true);
  });
});
