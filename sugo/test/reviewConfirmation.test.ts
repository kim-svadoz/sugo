import { describe, expect, it } from "vitest";
import { buildReviewConfirmationBlocker } from "../src/reviewConfirmation.js";

describe("buildReviewConfirmationBlocker", () => {
  it("review_done 확인에 필요한 내용을 고정된 Dashboard 계약으로 만든다", () => {
    const blocker = buildReviewConfirmationBlocker({
      sessionId: "plan-1",
      summary: "회원가입 이메일 검증을 수정했습니다.",
      changes: ["이메일 형식 검증을 추가했습니다."],
      tests: ["SignupServiceTest 통과"],
      designDecisions: ["이메일은 소문자로 정규화합니다."],
      knownLimitations: ["브라우저 테스트는 실행하지 않았습니다."],
      files: [{ path: "src/service.ts", change: "modified", content: "secret body is not embedded in packet" }],
    });

    expect(blocker).toMatchObject({
      schemaVersion: 1,
      kind: "review_confirmation",
      stage: "REVIEW_RUNNING",
      resumeAction: "review_done",
      question: "이 작업 결과로 review_done을 진행할까요?",
      blockedNextStep: "review_done 확인 후 docs 단계 진행",
    });
    expect(blocker.options.map((option) => option.id)).toEqual(["approve", "revise"]);
    expect(blocker.reviewPacket?.tests).toEqual(["SignupServiceTest 통과"]);
    expect(blocker.reviewPacket?.files).toEqual([{ path: "src/service.ts", change: "modified" }]);
  });
});
