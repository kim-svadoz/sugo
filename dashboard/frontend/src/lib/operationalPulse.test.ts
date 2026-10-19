import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { schedulePulse, workspacePulse } from "./operationalPulse.js";

describe("operational pulse", () => {
  it("전체 워크스페이스의 실행·확인 필요·완료 상태를 한 번에 요약한다", () => {
    expect(workspacePulse([
      { activeTaskCount: 2, attentionCount: 1, roadmapCount: 5, roadmapDoneCount: 3 },
      { activeTaskCount: 0, attentionCount: 0, roadmapCount: 4, roadmapDoneCount: 4 },
    ])).toEqual({ active: 2, attention: 1, done: 7, total: 9 });
  });

  it("Schedule에서 오늘·7일 내·기한 초과·미정 일정을 구분한다", () => {
    expect(schedulePulse([
      { due_date: "2026-10-13", status: "pending" },
      { due_date: "2026-10-14", status: "pending" },
      { due_date: "2026-10-18", status: "done" },
      { due_date: "2026-10-21", status: "pending" },
      { due_date: null, status: "pending" },
    ], "2026-10-14")).toEqual({ dueToday: 1, dueThisWeek: 2, overdue: 1, unscheduled: 1 });
  });

  it("Workspaces 첫 랜딩은 첫 워크스페이스을 한 번만 자동 선택한다", () => {
    const source = readFileSync(new URL("../pages/Sessions.tsx", import.meta.url), "utf8");
    expect(source).toContain("initialSelectionApplied.current");
    expect(source).toContain("setSelectedWorkspace(workspaces[0].name)");
  });
});
