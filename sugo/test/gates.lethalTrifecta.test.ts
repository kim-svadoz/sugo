import { describe, expect, it } from "vitest";
import {
  checkLethalTrifectaCalledGate,
  checkLethalTrifectaMitigationGate,
  type LastLethalTrifectaCheck,
} from "../src/gates.js";

function lastCheck(overrides: Partial<LastLethalTrifectaCheck> = {}): LastLethalTrifectaCheck {
  return {
    checkedAt: "2026-09-29T00:00:00.000Z",
    warnings: [],
    ...overrides,
  };
}

describe("checkLethalTrifectaCalledGate — sugo_check_lethal_trifecta 호출강제(sugo_validate 게이트와 같은 패턴)", () => {
  it("한 번도 안 불렀으면 반드시 거부한다", () => {
    const result = checkLethalTrifectaCalledGate(undefined);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("LETHAL_TRIFECTA_NOT_CALLED");
  });

  it("호출 이력만 있으면 경고 유무와 무관하게 통과한다", () => {
    expect(checkLethalTrifectaCalledGate(lastCheck({ warnings: [] })).ok).toBe(true);
    expect(
      checkLethalTrifectaCalledGate(lastCheck({ warnings: [{ toolName: "x", reason: "y" }] })).ok,
    ).toBe(true);
  });
});

describe("checkLethalTrifectaMitigationGate — 경고가 있으면 완화사유를 요구한다", () => {
  it("경고가 있는데 완화사유가 없으면 거부하고 어떤 도구인지 밝힌다", () => {
    const result = checkLethalTrifectaMitigationGate(
      lastCheck({ warnings: [{ toolName: "web-fetch-and-read-secrets", reason: "3축 동시 성립" }] }),
      undefined,
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("LETHAL_TRIFECTA_MITIGATION_REQUIRED");
    expect(result.message).toContain("web-fetch-and-read-secrets");
  });

  it("경고가 있어도 완화사유를 제출하면 통과한다", () => {
    const result = checkLethalTrifectaMitigationGate(
      lastCheck({ warnings: [{ toolName: "web-fetch-and-read-secrets", reason: "3축 동시 성립" }] }),
      "sub-agent로 격리하고 외부 통신 capability를 제거했다",
    );
    expect(result.ok).toBe(true);
  });

  it("완화사유가 공백뿐이면 거부한다(빈 사유로 우회 금지)", () => {
    const result = checkLethalTrifectaMitigationGate(
      lastCheck({ warnings: [{ toolName: "x", reason: "y" }] }),
      "   ",
    );
    expect(result.ok).toBe(false);
    expect(result.code).toBe("LETHAL_TRIFECTA_MITIGATION_REQUIRED");
  });

  it("경고가 없으면 완화사유 없이도 통과한다", () => {
    expect(checkLethalTrifectaMitigationGate(lastCheck({ warnings: [] }), undefined).ok).toBe(true);
  });

  it("호출 자체를 안 했으면(undefined) 이 게이트 단독으로는 통과시킨다(호출강제는 별개 게이트)", () => {
    expect(checkLethalTrifectaMitigationGate(undefined, undefined).ok).toBe(true);
  });

  it("여러 도구가 경고면 전부 나열한다", () => {
    const result = checkLethalTrifectaMitigationGate(
      lastCheck({
        warnings: [
          { toolName: "tool-a", reason: "3축 동시 성립" },
          { toolName: "tool-b", reason: "3축 동시 성립" },
        ],
      }),
      undefined,
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("tool-a");
    expect(result.message).toContain("tool-b");
  });
});
