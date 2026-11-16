import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { currentReviewRounds, reviewConfirmationSections, revisionRequestText, type ReviewRound } from "./reviewConfirmation.js";

describe("reviewConfirmationSections", () => {
  it("빈 섹션을 숨기고 사람이 읽을 순서로 정리한다", () => {
    expect(reviewConfirmationSections({
      summary: "이메일 검증 로직을 추가했습니다.",
      changes: ["가입 폼에 검증 추가"],
      tests: ["3/3 통과"],
      designDecisions: [],
      knownLimitations: ["메일 발송은 실행하지 않음"],
    })).toEqual([
      { id: "summary", title: "작업 요약", items: ["이메일 검증 로직을 추가했습니다."] },
      { id: "changes", title: "변경 내용", items: ["가입 폼에 검증 추가"] },
      { id: "tests", title: "검증 결과", items: ["3/3 통과"] },
      { id: "knownLimitations", title: "알려진 한계", items: ["메일 발송은 실행하지 않음"] },
    ]);
  });

  it("체크리스트를 마치면 승인 또는 수정 요청을 저장해 작업 세션이 자동 재개한다", () => {
    const source = readFileSync(join(process.cwd(), "src/components/BlockerDecisionPanel.tsx"), "utf8");
    expect(source).toContain("승인하고 계속하기");
    expect(source).toContain("수정 요청");
    expect(source).toContain("작업 세션이 결정을 감지하면 자동으로 계속 진행합니다");
    expect(source).toContain("작업 세션이 결정을 감지하면 자동으로 수정 작업을 시작합니다");
    expect(source).toContain("이번 변경 파일 diff 보기");
    expect(source).not.toContain("원래 작업 세션에 프롬프트를 붙여넣으면");
    expect(source).not.toContain(">확인, 진행</button>");
    expect(source).not.toContain("진행 결정 저장됨");
    expect(source).toContain("검토 자료");
    expect(source).toContain("결과 확인");
    expect(source).toContain("요청 사항");
    expect(source).toContain("다음 단계");
    expect(source).toContain("reportChecked");
    expect(source).toContain("diffChecked");
    expect(source).toContain("요청 사항 없음");
    expect(source).toContain("검토 항목을 모두 확인해야 다음 단계로 갈 수 있습니다");
    expect(source).not.toContain("void copyResume(\"확인, 진행\"");
  });
});

describe("검토 회차", () => {
  const round = (value: number, sessionId: string, decision: ReviewRound["decision"] = "revise"): ReviewRound => ({
    round: value, sessionId, requestedAt: "2026-11-16T00:00:00.000Z", decision, response: decision === "revise" ? "수정 필요 — 실패 메시지를 바꿔 주세요." : "확인, 진행",
    reviewPacket: { round: value, summary: `${value}차`, changes: [], tests: [], designDecisions: [], knownLimitations: [] },
  });

  it("확인 대기 중인 세션의 회차만 순서대로 고른다", () => {
    const rounds = [round(2, "feat"), round(1, "patch"), round(1, "feat")];
    expect(currentReviewRounds(rounds, "feat").map((item) => [item.sessionId, item.round])).toEqual([["feat", 1], ["feat", 2]]);
  });

  it("확인 대기가 없으면 마지막으로 기록된 세션의 회차를 고른다", () => {
    expect(currentReviewRounds([round(1, "feat"), round(2, "feat", "approve"), round(1, "patch", "approve")]).map((item) => item.sessionId)).toEqual(["patch"]);
    expect(currentReviewRounds(null)).toEqual([]);
  });

  it("버튼이 붙인 접두어를 떼고 사용자가 쓴 요청만 보여 준다", () => {
    expect(revisionRequestText("수정 필요 — 실패 메시지를 바꿔 주세요.")).toBe("실패 메시지를 바꿔 주세요.");
    expect(revisionRequestText("테스트를 추가해 주세요.")).toBe("테스트를 추가해 주세요.");
  });
});
