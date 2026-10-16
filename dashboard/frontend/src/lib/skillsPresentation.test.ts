import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../pages/Skills.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../api/catalogApi.ts", import.meta.url), "utf8");

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

  it("같은 이름의 스킬과 Command 상세를 현재 카탈로그 종류로 구분해 조회한다", () => {
    expect(source).toContain("getSkillContent(selectedSkill.name, catalogView === \"commands\" ? \"command\" : \"skill\")");
  });

  it("실행 원문을 바꾸지 않고 목록과 상세에 한국어 표시 locale을 요청한다", () => {
    expect(apiSource).toContain('"/api/skills?locale=ko"');
    expect(apiSource).toContain("&locale=ko");
  });
});
