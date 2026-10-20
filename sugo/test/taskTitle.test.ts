import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { completedCycleTitle, taskCycleTitle } from "../src/taskTitle.js";

describe("차수별 Task 제목", () => {
  it("patch PRD의 제목에서 기능명 뒤 핵심 제목만 사용한다", () => {
    expect(taskCycleTitle(
      "2차 patch: 할 일 항목이 늘어도 한 번에 하나씩 추가하도록 대비한다. 뒤 문장은 상세 작업이다.",
      "할 일 추가",
      "# PRD patch v2: 할 일 추가 — 항목별 등록\n",
    )).toBe("항목별 등록");
  });

  it("대시로 구분한 patch PRD 제목도 핵심 제목으로 읽는다", () => {
    expect(taskCycleTitle(
      undefined,
      "infinite-scroll-discovery",
      "# PRD-patch-v2 — 무한스크롤을 선호카테고리 서빙으로 전환한다.\n",
    )).toBe("무한스크롤을 선호카테고리 서빙으로 전환한다.");
  });

  it("feat PRD는 괄호 속 브랜치 설명을 제외한 기능명을 사용한다", () => {
    expect(taskCycleTitle(undefined, "기존 제목", "# PRD: 할 일 추가 (feature/add-todo)\n"))
      .toBe("할 일 추가");
  });

  it("완료 요약에서는 기능명보다 실제 수행한 첫 문장을 제목으로 사용한다", () => {
    expect(taskCycleTitle(
      "할 일 추가 기능은 입력값을 검증한 뒤 목록에 저장한다. 이후 문장은 상세 검증이다.",
      "할 일 추가",
    )).toBe("할 일 추가 기능은 입력값을 검증한 뒤 목록에 저장한다.");
  });

  it("완료 History 저장도 review 요약에서 구체적인 제목을 만든다", () => {
    const source = readFileSync(new URL("../src/tools/sugoPlan.ts", import.meta.url), "utf8");
    expect(source).toContain("task_title: taskCycleTitle(session.data.chainInfo.reviewSummary, session.featureName)");
    expect(source).not.toContain("task_title: session.featureName");
  });

  it("patch commit은 featureName 대신 시작 때 확정한 차수 제목을 보존한다", () => {
    expect(completedCycleTitle({
      version: 2,
      featureName: "infinite-scroll-discovery",
      patchInfoTitle: "무한스크롤을 선호카테고리로 전환한다.",
      seed: "다른 fallback",
    })).toBe("무한스크롤을 선호카테고리로 전환한다.");
    expect(completedCycleTitle({ version: 0, featureName: "infinite-scroll-discovery" }))
      .toBe("infinite-scroll-discovery");
  });
});
