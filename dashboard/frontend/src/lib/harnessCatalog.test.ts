import { describe, expect, it } from "vitest";
import { groupHarnessManifest, harnessVersion } from "./harnessCatalog.js";

describe("harness catalog", () => {
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
