import { describe, expect, it } from "vitest";
import { blockerResumePrompt } from "./blockerDecision.js";

describe("blockerResumePrompt", () => {
  it("carries the exact workspace, task and human decision back to the agent session", () => {
    expect(blockerResumePrompt({
      workspace: "tmp-sugo-showcase",
      taskId: "demo-refund",
      taskTitle: "고액 환불 이중 승인",
      question: "승인 금액 기준 미확정",
      response: "100만원 이상은 팀장 승인을 받는다.",
    })).toContain("workspace: tmp-sugo-showcase\ntask: demo-refund · 고액 환불 이중 승인\n차단 질문: 승인 금액 기준 미확정\n사용자 결정: 100만원 이상은 팀장 승인을 받는다.");
  });

  it("requires the agent to consume the dashboard decision in the original session before resuming", () => {
    const prompt = blockerResumePrompt({
      workspace: "ws", taskId: "task-1", taskTitle: "정책 구현", question: "승인자는?", response: "팀장",
      sessionId: "plan-1", resumeAction: "code_done",
    });
    expect(prompt).toContain('sugo_roadmap(action:"resume_with_decision", workspace:"ws", id:"task-1", sessionId:"plan-1")');
    expect(prompt).toContain('sugo_plan(action:"code_done")');
  });
});
