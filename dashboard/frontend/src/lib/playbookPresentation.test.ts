import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../pages/Playbook.tsx", import.meta.url), "utf8");

describe("Playbook product lifecycle", () => {
  it("사용자의 AI 개발 가치 흐름을 여섯 단계로 안내한다", () => {
    for (const label of ["의도를 SPEC으로", "맥락을 규칙으로", "작업을 통제하며", "근거로 판단하기", "변경을 이어가기", "제품까지 추적하기"]) {
      expect(source).toContain(`label: "${label}"`);
    }
  });

  it("Claude와 Codex의 공통 규칙 및 SPEC의 사용자 가치를 명시한다", () => {
    expect(source).toContain("세션과 실행 도구가 바뀌어도 판단 기준이 유지됩니다.");
    expect(source).toContain("기획 시점과 구현 시점의 제품 간격");
    expect(source).not.toContain("/Users/demo-user");
  });

  it("승인보다 근거를 먼저 제시하고 개발부터 배포까지 구분한다", () => {
    expect(source).toContain("review_done gate");
    expect(source).toContain("사람이 결정할 준비가 된 상태");
    expect(source).toContain("파이프라인 DONE과 Git push·실제 배포 완료");
    expect(source).toContain("코드가 끝난 시점이 아니라 제품에 도달한 지점");
  });

  it("탭과 패널의 접근성 관계를 제공한다", () => {
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tab"');
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain("aria-selected={selected}");
  });
});
