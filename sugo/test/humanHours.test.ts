import { describe, expect, it } from "vitest";
import { estimateHumanHours } from "../src/humanHours.js";

describe("estimateHumanHours", () => {
  it("경과시간 0이면 복잡도 가산만 남는다", () => {
    const result = estimateHumanHours("2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z", 2, 1);
    expect(result.aiExecutionMinutes).toBe(0);
    expect(result.estimatedHumanHours).toBeCloseTo(2 * 0.1 + 1 * 0.15, 5);
  });

  it("경과 60분이면 기본 보정비율(3.5)이 반영된다", () => {
    const result = estimateHumanHours("2026-01-01T00:00:00.000Z", "2026-01-01T01:00:00.000Z", 0, 0);
    expect(result.aiExecutionMinutes).toBe(60);
    expect(result.estimatedHumanHours).toBeCloseTo(3.5, 5);
  });

  it("analyze/재시도 횟수가 많을수록 추정치가 커진다", () => {
    const low = estimateHumanHours("2026-01-01T00:00:00.000Z", "2026-01-01T00:30:00.000Z", 1, 0);
    const high = estimateHumanHours("2026-01-01T00:00:00.000Z", "2026-01-01T00:30:00.000Z", 3, 3);
    expect(high.estimatedHumanHours).toBeGreaterThan(low.estimatedHumanHours);
  });
});
