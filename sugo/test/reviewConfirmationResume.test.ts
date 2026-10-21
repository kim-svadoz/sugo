import { describe, expect, it } from "vitest";
import { buildReviewConfirmationBlocker, reviewDecisionResumeAction } from "../src/reviewConfirmation.js";

describe("reviewDecisionResumeAction", () => {
  const blocker = buildReviewConfirmationBlocker({
    sessionId: "plan-1", summary: "요약", changes: [], tests: [], designDecisions: [], knownLimitations: [],
  });

  it("승인만 review_done으로 보내고 수정 요청은 같은 차수의 code 단계로 돌려보낸다", () => {
    expect(reviewDecisionResumeAction(blocker, "확인, 진행")).toBe("review_done");
    expect(reviewDecisionResumeAction(blocker, "캐시 이름을 다시 검토해 주세요")).toBe("code_start");
  });
});
