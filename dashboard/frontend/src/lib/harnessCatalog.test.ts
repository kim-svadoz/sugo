import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { groupHarnessManifest, harnessVersion, simplifyHarnessHeading } from "./harnessCatalog.js";

describe("harness catalog", () => {
  it("Harness 본문 제목에서는 페이지 UI와 중복되는 명칭과 내부 경로를 제거한다", () => {
    expect(simplifyHarnessHeading("# Java 하네스 (lang/java)\n\n핵심 규칙")).toBe("# Java\n\n핵심 규칙");
    expect(simplifyHarnessHeading("# React 19 하네스 (framework/react/19.x)\n\n하네스 규칙을 적용한다.")).toBe("# React 19\n\n하네스 규칙을 적용한다.");
    expect(simplifyHarnessHeading("# Express 하네스 (framework/express)\n\n설명")).toBe("# Express\n\n설명");
    expect(simplifyHarnessHeading("# 기본 하네스 (default)\n\n설명")).toBe("# 기본\n\n설명");
  });

  it("선택 헤더에도 사용자가 해석할 필요 없는 내부 catalog ID를 반복하지 않는다", () => {
    const source = readFileSync(new URL("../pages/Harness.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("selectedEntry?.id");
  });

  it("카테고리와 기술을 묶고 공통/버전을 한 기술 안에 둔다", () => {
    const groups = groupHarnessManifest([
      { id: "buildtool/gradle/9.x", name: "buildtool/gradle/9.x", version: "9.x" },
      { id: "framework/spring/3.x", name: "framework/spring/3.x", version: "3.x" },
      { id: "buildtool/gradle", name: "buildtool/gradle" },
      { id: "buildtool/gradle/8.x", name: "buildtool/gradle/8.x", version: "8.x" },
    ]);
    const gradle = groups.find((group) => group.key === "buildtool/gradle");
    expect(gradle?.categoryLabel).toBe("빌드 도구");
    expect(gradle?.versions.map(harnessVersion)).toEqual(["8.x", "9.x", "공통"]);
  });
});
