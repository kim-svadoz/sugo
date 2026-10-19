import { describe, expect, it } from "vitest";
import { readWeeklyRouteState, writeWeeklyRouteState } from "./weeklyRouteState.js";

describe("Weekly 상세 위치 보존", () => {
  it("선택한 주차와 상세 탭을 URL에서 복원한다", () => {
    expect(readWeeklyRouteState(new URLSearchParams("week=2026-W42&view=learning"))).toEqual({ weekId: "2026-W42", view: "learning" });
  });

  it("주차 선택과 상세 탭을 기존 검색 조건을 보존하며 기록한다", () => {
    expect(writeWeeklyRouteState(new URLSearchParams("source=manual"), "2026-W42", "report").toString()).toBe("source=manual&week=2026-W42&view=report");
  });

  it("주차를 닫으면 상세 위치만 지운다", () => {
    expect(writeWeeklyRouteState(new URLSearchParams("source=manual&week=2026-W42&view=learning"), null, "report").toString()).toBe("source=manual");
  });
});
