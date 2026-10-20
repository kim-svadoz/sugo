import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { reviewConfirmationSections } from "./reviewConfirmation.js";

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

  it("진행 승인과 수정 요청은 각각 저장과 재개 프롬프트 복사를 한 번에 수행한다", () => {
    const source = readFileSync(join(process.cwd(), "src/components/BlockerDecisionPanel.tsx"), "utf8");
    expect(source).toContain("검토 완료 · 재개 프롬프트 복사");
    expect(source).toContain("수정 요청 저장 · 재개 프롬프트 복사");
    expect(source).not.toContain(">확인, 진행</button>");
    expect(source).not.toContain("진행 결정 저장됨");
  });
});
