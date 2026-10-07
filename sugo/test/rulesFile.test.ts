import { describe, expect, it } from "vitest";
import { buildClaudeRuleFile, buildEffectiveClaudeRuleFiles, mergeRootClaudeReference } from "../src/harness/rulesFile.js";

describe("buildClaudeRuleFile", () => {
  it("경로 스코프가 있는 하네스는 paths frontmatter를 낸다", () => {
    const file = buildClaudeRuleFile("lang/java", "# Java 하네스\n\n## 핵심 규칙\n\n1. 규칙 A\n");
    expect(file.relPath).toBe(".claude/rules/lang-java.md");
    expect(file.content.startsWith("---\npaths:\n")).toBe(true);
    expect(file.content).toContain('"**/*.java"');
    expect(file.content).toContain("## 핵심 규칙");
  });

  it("버전 하네스는 '/'와 '.'가 섞인 id도 안전한 파일명이 된다", () => {
    const file = buildClaudeRuleFile("framework/spring/4.x", "# Spring 4\n");
    expect(file.relPath).toBe(".claude/rules/framework-spring-4.x.md");
  });

  it("default처럼 글롭이 없는 하네스는 frontmatter 없이 항상 로드되게 한다", () => {
    const file = buildClaudeRuleFile("default", "# 기본 하네스\n\n## 핵심 규칙\n\n1. x\n");
    expect(file.content.startsWith("---")).toBe(false);
    expect(file.content.startsWith("# 기본 하네스")).toBe(true);
  });

  it("glob에 따옴표가 이스케이프 없이도 안전한 값만 들어간다(YAML 인젝션 방지 전제)", () => {
    const file = buildClaudeRuleFile("lang/typescript", "# TS\n");
    // 큰따옴표로 감싼 각 줄이 유효한 YAML 리스트 항목 형태인지
    const fmLines = file.content.split("\n---")[0].split("\n").filter((l) => l.startsWith("  - "));
    for (const line of fmLines) expect(line).toMatch(/^ {2}- "[^"]*"$/);
  });
});

describe("buildEffectiveClaudeRuleFiles", () => {
  it("버전 하네스가 있으면 base 규칙을 버전 파일에 합치고 base 파일은 만들지 않는다", () => {
    const files = buildEffectiveClaudeRuleFiles([
      { id: "default", harnessMd: "# default" },
      { id: "lang/java", harnessMd: "# java common" },
      { id: "lang/java/17", harnessMd: "# java 17" },
    ]);
    expect(files.map((file) => file.relPath)).toEqual([
      ".claude/rules/default.md",
      ".claude/rules/lang-java-17.md",
    ]);
    expect(files[1].content).toContain("# java common");
    expect(files[1].content).toContain("# java 17");
  });
});

describe("mergeRootClaudeReference — 관리 블록은 idempotent하다", () => {
  const ids = ["default", "lang/java", "lang/java/21"];

  it("기존 CLAUDE.md가 없으면 새로 만든다", () => {
    const { content, changed } = mergeRootClaudeReference(null, ids);
    expect(changed).toBe(true);
    expect(content).toContain("<!-- sugo:harness-rules:start -->");
    expect(content).toContain("<!-- sugo:harness-rules:end -->");
    expect(content).toContain("lang/java/21");
  });

  it("사람이 쓴 기존 내용은 보존하고 블록만 끝에 추가한다", () => {
    const existing = "# 내 프로젝트\n\n사람이 쓴 설명.\n";
    const { content } = mergeRootClaudeReference(existing, ids);
    expect(content).toContain("사람이 쓴 설명.");
    expect(content.indexOf("사람이 쓴 설명.")).toBeLessThan(content.indexOf("sugo:harness-rules:start"));
  });

  it("이미 블록이 있으면 그 자리에서 교체하고 바깥 내용은 안 건드린다", () => {
    const first = mergeRootClaudeReference("# 내 프로젝트\n", ids).content;
    const second = mergeRootClaudeReference(first, ["default", "lang/python"]).content;

    expect(second).toContain("# 내 프로젝트");
    expect(second).not.toContain("lang/java");
    expect(second).toContain("lang/python");
    // 블록이 두 번 생기지 않는다
    expect(second.split("sugo:harness-rules:start").length).toBe(2);
  });

  it("같은 하네스 목록으로 다시 병합하면 변경 없음으로 보고한다", () => {
    const first = mergeRootClaudeReference("# 프로젝트\n", ids).content;
    const { changed } = mergeRootClaudeReference(first, ids);
    expect(changed).toBe(false);
  });

  it("적용된 하네스가 없으면 빈 목록으로 명시한다(조용히 생략하지 않는다)", () => {
    const { content } = mergeRootClaudeReference(null, []);
    expect(content).toMatch(/없음|비어/);
  });
});
