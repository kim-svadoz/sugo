import { describe, expect, it } from "vitest";
import { buildChainPrompt, type ChainHandoff } from "../src/chain.js";

const HANDOFF: ChainHandoff = {
  project: "/tmp/demo",
  changedFiles: ["src/login.ts"],
  changeType: "feature",
  summary: "이메일 로그인 기능 추가",
  prdPath: "/tmp/demo/sugo/features/20260101/login/prd.md",
  sessionId: "plan-1",
  verificationPlan: {
    fingerprint: "plan-1",
    level: "targeted",
    reasons: ["isolated-change"],
    implementationChecks: ["targeted-test"],
    releaseChecks: [],
    broadCommandsAllowed: false,
  },
};

describe("buildChainPrompt", () => {
  it("code_to_test 프롬프트는 PRD를 oracle로 삼으라는 지시와 순환검증 방지 문구를 포함한다", () => {
    const prompt = buildChainPrompt("code_to_test", HANDOFF);
    expect(prompt).toContain("test-agent");
    expect(prompt).toContain("oracle");
    expect(prompt).toContain("순환검증 방지");
    expect(prompt).toContain(HANDOFF.summary);
    expect(prompt).toContain(HANDOFF.prdPath!);
  });

  it("test_to_review 프롬프트는 읽기전용 지시와 사용자확인 요구를 포함한다", () => {
    const prompt = buildChainPrompt("test_to_review", HANDOFF);
    expect(prompt).toContain("읽기 전용");
    expect(prompt).toContain("코드를 수정하지 마세요");
    expect(prompt).toContain("userConfirmed:true");
    expect(prompt).toContain("request_review_confirmation");
    expect(prompt).toContain("wait_for_decision");
    expect(prompt).not.toContain("resume_with_decision으로 확인");
    expect(prompt).toContain("Dashboard");
  });

  it("changedFiles가 비어있으면 '(없음)'으로 표기한다", () => {
    const prompt = buildChainPrompt("code_to_test", { ...HANDOFF, changedFiles: [] });
    expect(prompt).toContain("변경 파일: (없음)");
  });

  it("targeted plan forbids full regression and tells the next agent to reuse matching evidence", () => {
    const prompt = buildChainPrompt("code_to_test", HANDOFF);
    expect(prompt).toContain("검증 범위: targeted");
    expect(prompt).toContain("전량 회귀를 실행하지 마세요");
    expect(prompt).toContain("입력 fingerprint가 같은 성공 증거는 재사용");
  });
});
