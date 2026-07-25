import { describe, expect, it } from "vitest";
import { buildChainPrompt, type ChainHandoff } from "../src/chain.js";

const HANDOFF: ChainHandoff = {
  project: "/tmp/demo",
  changedFiles: ["src/login.ts"],
  changeType: "feature",
  summary: "이메일 로그인 기능 추가",
  prdPath: "/tmp/demo/sugo/features/20260101/login/prd.md",
  sessionId: "plan-1",
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
  });

  it("changedFiles가 비어있으면 '(없음)'으로 표기한다", () => {
    const prompt = buildChainPrompt("code_to_test", { ...HANDOFF, changedFiles: [] });
    expect(prompt).toContain("변경 파일: (없음)");
  });
});
