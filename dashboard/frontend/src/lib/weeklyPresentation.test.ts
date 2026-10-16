import { describe, expect, it } from "vitest";
import { toWeeklyView } from "./weeklyPresentation.js";

describe("weekly 보고서 화면 모델", () => {
  it("보고서 JSON의 필드를 화면 모델로 옮긴다", () => {
    const view = toWeeklyView({
      headline: ["요약 1", "요약 2"],
      topics: [
        {
          title: "대시보드 번들",
          workspace: "inventory",
          category: "기능",
          one_line: "한 줄",
          done: ["완료 1"],
          results: ["결과 1"],
          todo: [{ text: "남은 일", kind: "todo" }],
        },
      ],
      next_week: [{ text: "다음 주 일", evidence: [] }],
      blocked: [{ text: "막힌 일", evidence: [] }],
      last_week_plan: [{ text: "지난주 계획", status: "done", evidence: [] }],
    });

    expect(view.headline).toEqual(["요약 1", "요약 2"]);
    expect(view.topics[0]).toMatchObject({ title: "대시보드 번들", workspace: "inventory", oneLine: "한 줄", done: ["완료 1"], todo: ["남은 일"] });
    expect(view.nextWeek).toEqual(["다음 주 일"]);
    expect(view.blocked).toEqual(["막힌 일"]);
    expect(view.lastWeekPlan).toEqual([{ text: "지난주 계획", status: "done" }]);
  });

  it("없는 필드와 잘못된 타입은 빈 값으로 둔다", () => {
    const view = toWeeklyView({ headline: "문자열", topics: [null, { title: 3 }], next_week: [{}] });

    expect(view.headline).toEqual([]);
    expect(view.topics).toHaveLength(2);
    expect(view.topics[1].title).toBe("");
    expect(view.nextWeek).toEqual([]);
    expect(view.blocked).toEqual([]);
  });
});
