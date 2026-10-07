import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (...segments: string[]) => readFileSync(join(root, ...segments), "utf8");

describe("코드 주석·이름 공통 정책", () => {
  const policy = read("harness-library", "code-quality-policy.md");

  it("검증 가능한 코드 품질 기준을 한 정본에 둔다", () => {
    expect(policy).toContain("기본값은 주석을 쓰지 않는 것");
    expect(policy).toContain("주석을 지우면 코드가 이해되지 않는다면");
    expect(policy).toContain("기존 도메인 어휘");
    expect(policy).toContain("Step 1");
    expect(policy).toContain("// Arrange");
    expect(policy).toContain("Handle errors");
    expect(policy).toContain("duplicate payment");
    expect(policy).toContain("AI스럽다");
    expect(policy).toContain("취향만 다른 경우에는 실패로 판정하지 않는다");
  });

  it.each(["code-agent.md", "test-agent.md", "review-agent.md", "docs-agent.md"])(
    "%s가 같은 정책 정본을 참조한다",
    (file) => {
      expect(read("agents", file)).toContain("harness-library/code-quality-policy.md");
    },
  );

  it.each([
    "implement",
    "bugfix",
    "refactor",
    "test-targeted",
    "test-full",
    "review-validate",
    "docs-readme",
  ])("%s 스킬이 Codex에서도 같은 정책 정본을 참조한다", (skill) => {
    expect(read("skills", skill, "SKILL.md")).toContain("harness-library/code-quality-policy.md");
  });
});
