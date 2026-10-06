import { describe, expect, it } from "vitest";
import { formatActivityTime } from "./activityTime.js";

describe("activity time in KST", () => {
  it("DB UTC datetime와 ISO UTC 시각을 동일한 KST로 표시한다", () => {
    for (const ts of ["2026-10-06 00:49:00.000", "2026-10-06T00:49:00", "2026-10-06T00:49:00.000Z"]) {
      expect(formatActivityTime(ts)).toBe("10-06 09:49");
    }
  });
  it("이미 명시된 오프셋은 보존하고 KST 날짜 경계를 적용한다", () => {
    expect(formatActivityTime("2026-10-06T09:49:00+09:00")).toBe("10-06 09:49");
    expect(formatActivityTime("2026-10-06 15:30:00")).toBe("10-07 00:30");
  });
  it("잘못된 시각을 원본 UTC 문자열로 대신 표시하지 않는다", () => {
    expect(formatActivityTime("invalid")).toBe("—");
  });
});
