import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../pages/Playbook.tsx", import.meta.url), "utf8");

describe("Playbook product lifecycle", () => {
  it("cold start부터 제거까지 현재 제품의 여섯 단계를 안내한다", () => {
    for (const label of ["설치와 등록", "규칙 적용", "SPEC에서 개발", "근거 검토", "후속 개발", "운영과 제거"]) {
      expect(source).toContain(`label: "${label}"`);
    }
  });

  it("Claude와 Codex의 공통 규칙 및 동적 SPEC 경로를 명시한다", () => {
    expect(source).toContain("Claude와 Codex가 같은 규칙을 읽습니다");
    expect(source).toContain("<HOME>/.claude/sugo/specs/YYYYMMDD/<slug>/vN/spec.md");
    expect(source).not.toContain("/Users/demo-user");
  });

  it("승인보다 근거를 먼저 제시하고 제거 수명주기를 구분한다", () => {
    expect(source).toContain("review_done gate");
    expect(source).toContain("evidence before approval");
    expect(source).toContain("비활성 보관");
    expect(source).toContain("완전 삭제");
  });

  it("탭과 패널의 접근성 관계를 제공한다", () => {
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tab"');
    expect(source).toContain('role="tabpanel"');
    expect(source).toContain("aria-selected={selected}");
  });
});
