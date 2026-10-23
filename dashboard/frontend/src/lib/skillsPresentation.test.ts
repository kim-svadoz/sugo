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
    expect(source).toContain("모든 에이전트");
    for (const label of ["구현 에이전트", "테스트 에이전트", "검토 에이전트", "문서 에이전트"]) expect(source).toContain(`"${label}"`);
    expect(source).toContain("이 스킬을 적용하는 주체");
    expect(source).toContain("agentSkillContext");
    expect(source).toContain("agentDisplayLabel(skill.agent)");
  });

  it("같은 이름의 스킬과 Command 상세를 현재 카탈로그 종류로 구분해 조회한다", () => {
    expect(source).toContain("getSkillContent(selectedSkill.name, catalogView === \"commands\" ? \"command\" : \"skill\")");
  });

  it("카탈로그와 담당 필터를 다른 화면의 보조 탭과 같은 밀도로 표시한다", () => {
    expect(source).toContain('aria-label="카탈로그 종류" className="flex flex-wrap items-center gap-3"');
    expect(source).toContain('rounded-md px-3 py-1.5 text-[12px]');
    expect(source).toContain('rounded-md px-2.5 py-1.5 text-[12px]');
    expect(source).not.toContain('rounded-md px-4 py-2 text-sm');
  });

  it("실행 원문을 바꾸지 않고 목록과 상세에 한국어 표시 locale을 요청한다", () => {
    expect(apiSource).toContain('"/api/skills?locale=ko"');
    expect(apiSource).toContain("&locale=ko");
  });

  it("사용자 안내에는 에이전트 원문의 영문 설명을 덧붙이지 않는다", () => {
    expect(source).not.toContain("selectedAgentMeta?.description");
    expect(source).toContain("agentSkillContext(selectedAgent)");
  });
});
