import { describe, expect, it } from "vitest";
import {
  HARNESS_TOOL_REGISTRY,
  mcpAllowPatterns,
  renderToolMenu,
  resolveHarnessToolGuides,
  type HarnessToolEntry,
} from "../src/harness/toolRegistry.js";

describe("HARNESS_TOOL_REGISTRY 기본값", () => {
  it("특화 MCP를 등록하지 않으면 기본은 빈 배열이다(§2 안전 기본값)", () => {
    expect(HARNESS_TOOL_REGISTRY).toEqual([]);
  });
});

const SAMPLE_REGISTRY: HarnessToolEntry[] = [
  {
    match: "spring",
    mcpNamespace: "mcp__java-tools__*",
    loadTools: ["find_class", "search_beans"],
    dispatch: [{ when: "code_start", use: "find_class로 관련 클래스부터 찾으세요" }],
  },
  {
    match: "react",
    mcpNamespace: "mcp__frontend-tools__*",
    loadTools: ["find_component"],
    dispatch: [{ when: "code_start", use: "find_component로 기존 컴포넌트를 확인하세요" }],
  },
];

describe("resolveHarnessToolGuides — 소문자 substring 매칭(§2)", () => {
  it("appliedHarnessIds 중 match 문자열을 포함하는 항목만 골라낸다", () => {
    const result = resolveHarnessToolGuides(["be/framework/spring/3.x", "be/gradle/8.x"], SAMPLE_REGISTRY);
    expect(result).toHaveLength(1);
    expect(result[0].match).toBe("spring");
  });

  it("대소문자를 가리지 않는다", () => {
    const result = resolveHarnessToolGuides(["FE/FRAMEWORK/REACT/18"], SAMPLE_REGISTRY);
    expect(result).toHaveLength(1);
    expect(result[0].match).toBe("react");
  });

  it("매칭이 없으면 빈 배열", () => {
    expect(resolveHarnessToolGuides(["lang/typescript"], SAMPLE_REGISTRY)).toEqual([]);
  });

  it("여러 항목이 매칭되면 전부 반환한다(중복 없이)", () => {
    const result = resolveHarnessToolGuides(["be/framework/spring/3.x", "fe/framework/react/18"], SAMPLE_REGISTRY);
    expect(result.map((g) => g.match).sort()).toEqual(["react", "spring"]);
  });
});

describe("mcpAllowPatterns", () => {
  it("매칭된 항목들의 mcpNamespace를 모은다", () => {
    const guides = resolveHarnessToolGuides(["be/framework/spring/3.x"], SAMPLE_REGISTRY);
    expect(mcpAllowPatterns(guides)).toEqual(["mcp__java-tools__*"]);
  });

  it("빈 가이드면 빈 배열", () => {
    expect(mcpAllowPatterns([])).toEqual([]);
  });
});

describe("renderToolMenu", () => {
  it("빈 가이드면 빈 문자열(특화 도구 없음을 조용히 표시)", () => {
    expect(renderToolMenu([])).toBe("");
  });

  it("가이드가 있으면 loadTools/dispatch 안내를 사람이 읽을 텍스트로 만든다", () => {
    const guides = resolveHarnessToolGuides(["be/framework/spring/3.x"], SAMPLE_REGISTRY);
    const menu = renderToolMenu(guides);
    expect(menu).toContain("find_class");
    expect(menu).toContain("find_class로 관련 클래스부터 찾으세요");
  });
});
