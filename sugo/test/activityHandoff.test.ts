import { describe, expect, it } from "vitest";
import { activityForPlanTransition, activityTaskDetails, reviewConfirmationActivity } from "../src/dashboard/activity.js";

describe("plan transition activity", () => {
  it.each([
    ["code_start", "CODE_READY", "MAIN", "CODE"],
    ["test_start", "CODE_DONE", "CODE", "TEST"],
    ["review_start", "TEST_DONE", "TEST", "REVIEW"],
    ["review_done", "REVIEW_RUNNING", "REVIEW", "DOCS"],
    ["docs_done", "DOCS_PENDING", "DOCS", "MAIN"],
  ] as const)("%s 성공 전이는 %s에서 %s→%s handoff를 만든다", (action, fromState, agent, handoffTo) => {
    expect(activityForPlanTransition(action, fromState, "결제 중복 방지")).toMatchObject({
      agent,
      handoffTo,
      eventType: "HANDOFF",
    });
  });

  it("review에서 code로 되돌아가면 REVIEW→CODE 재작업 handoff를 만든다", () => {
    expect(activityForPlanTransition("code_start", "REVIEW_RUNNING", "결제 중복 방지")).toMatchObject({
      agent: "REVIEW",
      handoffTo: "CODE",
    });
  });

  it("상태 조회나 완료 commit은 handoff가 아니다", () => {
    expect(activityForPlanTransition("status", "CODE_RUNNING", "결제 중복 방지")).toBeNull();
    expect(activityForPlanTransition("commit", "COMMIT_PENDING", "결제 중복 방지")).toBeNull();
  });

  it("다음 단계에는 직전 단계의 실제 결과를 요약해 전달한다", () => {
    expect(activityForPlanTransition("review_start", "TEST_DONE", "결제 중복 방지", { testSummary: "75/75 통과 · ./gradlew check" })?.message)
      .toContain("75/75 통과");
    expect(activityForPlanTransition("docs_done", "DOCS_PENDING", "결제 중복 방지", { workResultPath: "docs/work-result.md" })?.message)
      .toContain("docs/work-result.md");
  });

  it("이벤트에 작업 식별자를 실어 Console이 작업별로 묶을 수 있게 한다", () => {
    expect(activityTaskDetails({ id: "s-1", featureName: "결제 중복 방지", projectPath: "/repos/payments", data: { linkedTaskId: "t-9" } })).toEqual({ task: { id: "t-9", sessionId: "s-1", name: "결제 중복 방지", projectPath: "/repos/payments" } });
    expect(activityTaskDetails({ id: "s-2", featureName: "검색 필터", projectPath: "/repos/search", data: {} })).toEqual({ task: { id: "s-2", sessionId: "s-2", name: "검색 필터", projectPath: "/repos/search" } });
  });

  it("검토 결과를 게시하면 사용자 확인 대기 이벤트를 만든다", () => {
    expect(reviewConfirmationActivity("결제 중복 방지")).toMatchObject({ agent: "REVIEW", eventType: "EXECUTE", stage: "user_confirmation" });
    expect(reviewConfirmationActivity("결제 중복 방지").message).toContain("사용자 확인 요청");
  });
});
