import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../pages/Skills.tsx", import.meta.url), "utf8");

describe("Skills catalog presentation", () => {
  it("스킬과 Command를 서로 다른 1차 보기로 분리한다", () => {
    expect(source).toContain('type CatalogView = "skills" | "commands"');
    expect(source).toContain("스킬은 AI가 작업 중 적용하는 규칙입니다.");
    expect(source).toContain("Command는 사용자가 직접 시작하는 명령입니다.");
  });

  it("스킬 보기에서 공용 스킬과 에이전트 전용 스킬을 구분한다", () => {
    expect(source).toContain('setSelectedAgent("common")');
    expect(source).toContain("공용 스킬");
    for (const label of ["구현", "테스트", "검토", "문서"]) expect(source).toContain(`"${label}"`);
  });
});
