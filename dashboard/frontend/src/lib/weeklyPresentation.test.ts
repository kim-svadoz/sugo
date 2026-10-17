import { describe, expect, it } from "vitest";
import { toWeeklyView } from "./weeklyPresentation.js";

describe("weekly 보고서 화면 모델", () => {
  it("보고서 JSON의 필드를 화면 모델로 옮긴다", () => {
    const view = toWeeklyView({
      headline: ["요약 1", "요약 2"],
      topics: [
        {
          title: "대시보드 번들",
          workspace: "tools",
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
    expect(view.topics[0]).toMatchObject({ title: "대시보드 번들", workspace: "tools", oneLine: "한 줄", done: ["완료 1"], todo: [{ text: "남은 일", kind: "todo" }] });
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

  it("기술 학습 내용과 주제 필터 관계를 보존한다", () => {
    const view = toWeeklyView({
      headline: [], topics: [{ title: "배포", one_line: "완료" }],
      tech: { learning_summary: ["배포 구조를 익혔다"], items: [{ name: "Docker", category: "인프라", level: "실무", definition: "컨테이너 실행 단위", topics: ["배포"], key_points: ["이미지"], alternatives: [{ name: "VM", pros: "강한 격리", cons: "무거움", when: "OS 격리" }], quiz: [{ q: "이미지란?", a: "실행 템플릿" }] }] },
    });
    expect(view.learningSummary).toEqual(["배포 구조를 익혔다"]);
    expect(view.learning[0]).toMatchObject({ name: "Docker", category: "인프라", relatedTopics: ["배포"], keyPoints: ["이미지"] });
    expect(view.learning[0].alternatives[0].name).toBe("VM");
    expect(view.learning[0].quiz[0]).toEqual({ question: "이미지란?", answer: "실행 템플릿" });
  });

  it("남은 일의 종류를 버리지 않는다", () => {
    const view = toWeeklyView({ topics: [{ title: "배포", todo: [{ text: "운영 승인", kind: "결정 필요" }] }] });
    expect(view.topics[0].todo).toEqual([{ text: "운영 승인", kind: "결정 필요" }]);
  });
});
