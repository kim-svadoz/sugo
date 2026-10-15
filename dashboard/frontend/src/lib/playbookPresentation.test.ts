import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../pages/Playbook.tsx", import.meta.url), "utf8");

describe("Playbook product lifecycle", () => {
  it("사용자의 AI 개발 가치 흐름을 여섯 단계로 안내한다", () => {
    for (const label of ["기획을 기능 명세로", "팀의 판단을 규칙으로", "작업 단계 통제", "근거를 보고 판단", "후속 변경 잇기", "배포까지 확인"]) {
      expect(source).toContain(`label: "${label}"`);
    }
  });

  it("Claude와 Codex의 공통 규칙 및 SPEC의 사용자 가치를 명시한다", () => {
    expect(source).toContain("세션과 AI 도구가 바뀌어도 같은 판단 기준을 적용합니다.");
    expect(source).toContain("기획과 현재 제품의 차이");
    expect(source).not.toContain("/Users/demo-user");
  });

  it("승인보다 근거를 먼저 제시하고 개발부터 배포까지 구분한다", () => {
    expect(source).toContain("검토 완료 조건");
    expect(source).toContain("사용자가 판단할 수 있는 상태");
    expect(source).toContain("개발 절차 완료, Git 전송, 실제 배포 완료");
    expect(source).toContain("코드 작성이 끝난 시점과 사용자가 기능을 받는 시점");
  });

  it("탭과 패널의 접근성 관계를 제공한다", () => {
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tab"');
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain("aria-selected={selected}");
  });
});
