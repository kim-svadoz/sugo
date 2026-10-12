import { describe, expect, it } from "vitest";
import { buildReviewConfirmationBlocker } from "../src/reviewConfirmation.js";

describe("buildReviewConfirmationBlocker", () => {
  it("review_done 확인에 필요한 내용을 고정된 Dashboard 계약으로 만든다", () => {
    const blocker = buildReviewConfirmationBlocker({
      sessionId: "plan-1",
      summary: "검색 필터 조회 조건을 수정했습니다.",
      changes: ["빈 결과 방어 로직을 추가했습니다."],
      tests: ["FilterServiceTest 37/37 통과"],
      designDecisions: ["조회 결과는 최대 30개로 제한합니다."],
      knownLimitations: ["운영 환경 시뮬레이터는 실행하지 않았습니다."],
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
    expect(blocker.reviewPacket?.tests).toEqual(["FilterServiceTest 37/37 통과"]);
    expect(blocker.reviewPacket?.files).toEqual([{ path: "src/service.ts", change: "modified" }]);
  });
});
