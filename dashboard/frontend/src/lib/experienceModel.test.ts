import { describe, expect, it } from "vitest";
import { buildScheduleAgenda, workspaceCommandSummary } from "./experienceModel.js";

describe("flagship workspace experience", () => {
  it("turns workspace totals into an action-oriented command summary", () => {
    expect(workspaceCommandSummary({ active: 2, attention: 1, done: 7, total: 10 })).toEqual({
      headline: "2개 도메인이 실행 중입니다",
      detail: "사람의 확인이 필요한 작업 1건을 먼저 확인하세요.",
      intent: "attention",
    });
  });

  it("keeps a calm summary when no workspace needs attention", () => {
    expect(workspaceCommandSummary({ active: 0, attention: 0, done: 10, total: 10 })).toEqual({
      headline: "모든 작업이 안정 상태입니다",
      detail: "완료 10/10 · 새 작업을 시작할 준비가 됐습니다.",
      intent: "stable",
    });
  });
});

describe("schedule agenda", () => {
  const row = (id: string, due_date: string | null, status = "pending") => ({
    id,
    title: id,
    due_date,
    status,
  });

  it("groups open work by urgency and leaves completed work in upcoming", () => {
    const agenda = buildScheduleAgenda(
      [
        row("late", "2026-10-13"),
        row("today", "2026-10-14"),
        row("soon", "2026-10-17"),
        row("later", "2026-11-02"),
        row("done", "2026-10-12", "done"),
      ],
      "2026-10-14",
    );

    expect(agenda.map((group) => [group.id, group.items.map((item) => item.id)])).toEqual([
      ["overdue", ["late"]],
      ["today", ["today"]],
      ["next", ["soon"]],
      ["later", ["done", "later"]],
    ]);
  });

  it("omits empty agenda groups", () => {
    expect(buildScheduleAgenda([row("later", "2026-12-01")], "2026-10-14").map((group) => group.id)).toEqual(["later"]);
  });
});
