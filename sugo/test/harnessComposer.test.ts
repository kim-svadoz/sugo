import { describe, expect, it } from "vitest";
import { compose } from "../src/harness/harnessComposer.js";
import type { DetectedStack, HarnessContent } from "../src/harness/types.js";

function emptyStack(overrides: Partial<DetectedStack> = {}): DetectedStack {
  return {
    languages: [],
    frameworks: [],
    dataStores: [],
    buildTools: [],
    infra: [],
    harnessIds: [],
    commands: {},
    ...overrides,
  };
}

function harness(id: string, harnessMd: string): HarnessContent {
  return { id, version: "1.0.0-local", harnessMd, validationYaml: "harnessId: " + id, source: "local" };
}

describe("HarnessComposer.compose — 순수 함수", () => {
  it("적용된 하네스 표와 핵심 규칙 요약(최대 2개)을 만든다", () => {
    const h = harness(
      "default",
      "# 기본\n\n## 핵심 규칙\n\n1. Rule A\n2. Rule B\n3. Rule C\n\n## 다음 섹션\n무시되어야 함",
    );
    const result = compose({
      harnesses: [h],
      projectName: "demo-project",
      detectedStack: emptyStack(),
      fetchWarnings: [],
    });

    expect(result.claudeMd).toContain("# demo-project — Sugo 하네스 인덱스");
    expect(result.claudeMd).toContain("| `default` | 1.0.0-local |");
    expect(result.claudeMd).toContain("- Rule A");
    expect(result.claudeMd).toContain("- Rule B");
    expect(result.claudeMd).not.toContain("- Rule C");
    expect(result.claudeMd).not.toContain("무시되어야 함");
    expect(result.appliedHarnesses).toEqual([{ id: "default", version: "1.0.0-local" }]);
  });

  it("harness.md/validation.yaml을 sugo/harness/<id>/ 경로로 매핑한다", () => {
    const result = compose({
      harnesses: [harness("lang/typescript", "# TS\n\n## 핵심 규칙\n\n1. any 금지\n")],
      projectName: "demo",
      detectedStack: emptyStack(),
      fetchWarnings: [],
    });

    const paths = result.harnessFiles.map((f) => f.relPath).sort();
    expect(paths).toEqual([
      "sugo/harness/lang/typescript/harness.md",
      "sugo/harness/lang/typescript/validation.yaml",
    ]);
  });

  it("fetchWarnings이 없으면 경고 섹션을 만들지 않는다", () => {
    const result = compose({
      harnesses: [harness("default", "# d\n\n## 핵심 규칙\n\n1. x\n")],
      projectName: "demo",
      detectedStack: emptyStack(),
      fetchWarnings: [],
    });
    expect(result.claudeMd).not.toContain("## 경고");
  });

  it("fetchWarnings이 있으면 경고 섹션에 포함한다", () => {
    const result = compose({
      harnesses: [harness("default", "# d\n\n## 핵심 규칙\n\n1. x\n")],
      projectName: "demo",
      detectedStack: emptyStack(),
      fetchWarnings: ['하네스 id "foo/bar"에 대한 로컬 콘텐츠를 찾지 못해 default로 폴백합니다.'],
    });
    expect(result.claudeMd).toContain("## 경고");
    expect(result.claudeMd).toContain("foo/bar");
  });

  it("감지된 스택 요약(언어/프레임워크/명령)을 인덱스에 포함한다", () => {
    const result = compose({
      harnesses: [harness("default", "# d\n\n## 핵심 규칙\n\n1. x\n")],
      projectName: "demo",
      detectedStack: emptyStack({
        languages: [{ id: "lang/typescript", category: "language", name: "TypeScript", version: "5.4.0", detectedBy: "tsconfig.json" }],
        commands: { build: "npm run build" },
      }),
      fetchWarnings: [],
    });
    expect(result.claudeMd).toContain("TypeScript 5.4.0");
    expect(result.claudeMd).toContain("build=`npm run build`");
  });

  it("base 하네스와 버전 델타 하네스가 같은 name+version이면 요약에서 한 번만 표시한다", () => {
    // withVersionBucket이 lang/java(버전 미표기 취급 없이 major만 담김)와 lang/java/17을
    // 같은 name="Java", version="17"로 함께 내보내는 실제 상황.
    const result = compose({
      harnesses: [harness("default", "# d\n\n## 핵심 규칙\n\n1. x\n")],
      projectName: "demo",
      detectedStack: emptyStack({
        languages: [
          { id: "lang/java", category: "language", name: "Java", version: "17", detectedBy: "build.gradle" },
          { id: "lang/java/17", category: "language", name: "Java", version: "17", detectedBy: "build.gradle" },
        ],
      }),
      fetchWarnings: [],
    });
    const languageLine = result.claudeMd.split("\n").find((l) => l.startsWith("- **언어:**"));
    expect(languageLine).toBe("- **언어:** Java 17");
  });
});
