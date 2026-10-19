import { describe, expect, it } from "vitest";
import { blockerResumePrompt } from "./blockerDecision.js";

describe("blockerResumePrompt", () => {
  it("carries the exact workspace, task and human decision back to the agent session", () => {
    expect(blockerResumePrompt({
      workspace: "tmp-sugo-showcase",
      taskId: "demo-reset",
      taskTitle: "비밀번호 재설정 링크",
      question: "링크 유효 시간 미확정",
      response: "유효 시간은 30분으로 한다.",
    })).toContain("workspace: tmp-sugo-showcase\ntask: demo-reset · 비밀번호 재설정 링크\n차단 질문: 링크 유효 시간 미확정\n사용자 결정: 유효 시간은 30분으로 한다.");
  });

  it("requires the agent to consume the dashboard decision in the original session before resuming", () => {
    const prompt = blockerResumePrompt({
      workspace: "ws", taskId: "task-1", taskTitle: "회원가입", question: "이메일 인증이 필요한가?", response: "필요하다",
      sessionId: "plan-1", resumeAction: "code_done",
    });
    expect(prompt).toContain('sugo_roadmap(action:"resume_with_decision", workspace:"ws", id:"task-1", sessionId:"plan-1")');
    expect(prompt).toContain('sugo_plan(action:"code_done")');
  });
});
