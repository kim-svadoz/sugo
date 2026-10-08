import type { HumanBlocker } from "./hulk/types.js";

export interface ReviewConfirmationInput {
  sessionId: string;
  summary: string;
  changes: string[];
  tests: string[];
  designDecisions: string[];
  knownLimitations: string[];
}

export function buildReviewConfirmationBlocker(input: ReviewConfirmationInput): HumanBlocker {
  return {
    schemaVersion: 1,
    kind: "review_confirmation",
    sessionId: input.sessionId,
    stage: "REVIEW_RUNNING",
    resumeAction: "review_done",
    summary: input.summary,
    question: "이 작업 결과로 review_done을 진행할까요?",
    context: [],
    options: [
      { id: "approve", label: "확인, 진행", impact: "review_done을 완료하고 docs 단계로 진행합니다." },
      { id: "revise", label: "수정 필요", impact: "수정할 내용을 기록하고 code 단계로 돌아갑니다." },
    ],
    blockedNextStep: "review_done 확인 후 docs 단계 진행",
    createdAt: new Date().toISOString(),
    reviewPacket: {
      summary: input.summary,
      changes: input.changes,
      tests: input.tests,
      designDecisions: input.designDecisions,
      knownLimitations: input.knownLimitations,
    },
  };
}
