import { describe, expect, it } from "vitest";
import { globsForHarnessId } from "../src/harness/harnessRouting.js";

describe("globsForHarnessId — routeHarnessesForFiles와 같은 테이블에서 파생", () => {
  it("lang/java는 .java/.kt 확장자와 빌드 파일 글롭을 낸다", () => {
    const globs = globsForHarnessId("lang/java");
    expect(globs).toContain("**/*.java");
    expect(globs).toContain("**/*.kt");
    expect(globs).toContain("**/pom.xml");
    expect(globs).not.toContain("**/*.ts"); // 자바스크립트 계열이 섞이면 안 된다
  });

  it("버전 하네스는 base와 같은 글롭을 상속한다(세그먼트 접두어 매칭)", () => {
    expect(globsForHarnessId("lang/java/21")).toEqual(globsForHarnessId("lang/java"));
    expect(globsForHarnessId("framework/spring/4.x")).toEqual(globsForHarnessId("framework/spring"));
  });

  it("framework/nextjs는 next.config.*와 tsx를 포함한다", () => {
    const globs = globsForHarnessId("framework/nextjs");
    expect(globs).toContain("**/*.tsx");
    expect(globs.some((g) => g.includes("next.config"))).toBe(true);
  });

  it("lang/java와 lang/javascript는 서로 다른 글롭을 낸다(세그먼트 접두어 사고 재발 방지)", () => {
    const java = globsForHarnessId("lang/java");
    const js = globsForHarnessId("lang/javascript");
    expect(java).not.toEqual(js);
    expect(js).not.toContain("**/*.java");
  });

  it("default처럼 커버되지 않는 id는 빈 배열이다(항상 로드로 처리하라는 신호)", () => {
    expect(globsForHarnessId("default")).toEqual([]);
  });

  it("중복 없이 정렬된 배열을 낸다", () => {
    const globs = globsForHarnessId("framework/node");
    expect(new Set(globs).size).toBe(globs.length);
    expect(globs).toEqual([...globs].sort());
  });
});
