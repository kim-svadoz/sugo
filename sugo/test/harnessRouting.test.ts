import { describe, expect, it } from "vitest";
import { routeHarnessesForFiles } from "../src/harness/harnessRouting.js";

/** Java 백엔드 + Next 프론트가 한 저장소에 있는 폴리글랏 프로젝트(버전 분기 포함). */
const POLYGLOT = [
  "default",
  "lang/java",
  "lang/java/21",
  "framework/spring",
  "framework/spring/4.x",
  "buildtool/maven",
  "lang/typescript",
  "framework/react",
  "framework/react/19.x",
  "framework/nextjs",
  "framework/nextjs/16.x",
  "buildtool/npm",
];

describe("routeHarnessesForFiles — 언어 계열로 좁히기", () => {
  it(".java 변경은 프론트 스택 전체를 제외한다", () => {
    const r = routeHarnessesForFiles(POLYGLOT, ["src/main/java/com/acme/UserService.java"]);
    expect(r.selected).toEqual([
      "default",
      "lang/java",
      "lang/java/21",
      "framework/spring",
      "framework/spring/4.x",
    ]);
    expect(r.excluded).toContain("framework/nextjs/16.x");
    expect(r.excluded).toContain("lang/typescript");
    expect(r.fellBackToAll).toBe(false);
  });

  it(".tsx 변경은 자바 스택 전체를 제외한다", () => {
    const r = routeHarnessesForFiles(POLYGLOT, ["web/app/dashboard/page.tsx"]);
    expect(r.selected).toContain("framework/nextjs/16.x");
    expect(r.selected).toContain("lang/typescript");
    expect(r.excluded).toContain("lang/java");
    expect(r.excluded).toContain("lang/java/21");
    expect(r.excluded).toContain("framework/spring/4.x");
  });

  it("두 계열을 같이 고치면 둘 다 들어온다", () => {
    const r = routeHarnessesForFiles(POLYGLOT, ["api/UserController.java", "web/app/page.tsx"]);
    expect(r.selected).toContain("lang/java/21");
    expect(r.selected).toContain("framework/nextjs/16.x");
  });
});

describe("routeHarnessesForFiles — 좁히다 규칙을 잃지 않는가", () => {
  it("default는 어떤 파일을 고치든 항상 포함된다", () => {
    const r = routeHarnessesForFiles(POLYGLOT, ["src/main/java/A.java"]);
    expect(r.selected[0]).toBe("default");
  });

  it("버전 하네스는 base와 함께 선택된다(델타가 혼자 빠지지 않는다)", () => {
    const r = routeHarnessesForFiles(POLYGLOT, ["A.java"]);
    expect(r.selected).toContain("lang/java");
    expect(r.selected).toContain("lang/java/21");
  });

  it("prefix 매칭은 세그먼트 단위다 — lang/java가 lang/javascript를 끌어오면 안 된다", () => {
    const applied = ["default", "lang/java", "lang/javascript"];
    const r = routeHarnessesForFiles(applied, ["Main.java"]);
    expect(r.selected).toEqual(["default", "lang/java"]);
    expect(r.excluded).toEqual(["lang/javascript"]);
  });

  it("인식 못 한 파일만 있으면 전량을 그대로 돌려준다(좁히지 않음)", () => {
    const r = routeHarnessesForFiles(POLYGLOT, ["README.md", "docs/adr/001.md"]);
    expect(r.selected).toEqual(POLYGLOT);
    expect(r.excluded).toEqual([]);
    expect(r.fellBackToAll).toBe(true);
    expect(r.unmatchedFiles).toEqual(["README.md", "docs/adr/001.md"]);
  });

  it("변경 파일이 아예 없으면 전량을 돌려준다(하위호환)", () => {
    const r = routeHarnessesForFiles(POLYGLOT, []);
    expect(r.selected).toEqual(POLYGLOT);
    expect(r.fellBackToAll).toBe(true);
  });

  it("인식된 파일이 하나라도 있으면 인식 못 한 파일이 섞여도 좁힌다", () => {
    const r = routeHarnessesForFiles(POLYGLOT, ["README.md", "A.java"]);
    expect(r.fellBackToAll).toBe(false);
    expect(r.excluded).toContain("framework/react");
    expect(r.unmatchedFiles).toEqual(["README.md"]);
  });
});

describe("routeHarnessesForFiles — 빌드 설정 파일", () => {
  it("pom.xml은 maven과 자바 계열을 부른다", () => {
    const r = routeHarnessesForFiles(POLYGLOT, ["pom.xml"]);
    expect(r.selected).toContain("buildtool/maven");
    expect(r.selected).toContain("lang/java/21");
    expect(r.excluded).toContain("buildtool/npm");
  });

  it("package.json은 npm과 노드 계열을 부른다", () => {
    const r = routeHarnessesForFiles(POLYGLOT, ["web/package.json"]);
    expect(r.selected).toContain("buildtool/npm");
    expect(r.selected).toContain("framework/react/19.x");
    expect(r.excluded).toContain("buildtool/maven");
  });

  it("requirements-dev.txt처럼 접미어가 붙어도 pip으로 인식한다", () => {
    const applied = ["default", "lang/python", "lang/python/3.12", "buildtool/pip"];
    const r = routeHarnessesForFiles(applied, ["requirements-dev.txt"]);
    expect(r.selected).toEqual(applied);
  });

  it("next.config.mjs는 nextjs를 부른다", () => {
    const r = routeHarnessesForFiles(POLYGLOT, ["next.config.mjs"]);
    expect(r.selected).toContain("framework/nextjs/16.x");
    expect(r.excluded).toContain("lang/java");
  });
});

describe("routeHarnessesForFiles — 경로 표기", () => {
  it("윈도우 역슬래시 경로도 동일하게 인식한다", () => {
    const r = routeHarnessesForFiles(POLYGLOT, ["src\\main\\java\\com\\acme\\User.java"]);
    expect(r.selected).toContain("lang/java/21");
    expect(r.fellBackToAll).toBe(false);
  });

  it("대문자 확장자도 인식한다", () => {
    const r = routeHarnessesForFiles(POLYGLOT, ["Legacy.JAVA"]);
    expect(r.selected).toContain("lang/java");
  });

  it("한글 디렉터리가 섞여도 확장자로 인식한다", () => {
    const r = routeHarnessesForFiles(POLYGLOT, ["프로젝트/소스/회원조회.java"]);
    expect(r.selected).toContain("lang/java");
  });

  it("점이 없는 파일명은 확장자로 오인하지 않는다", () => {
    const r = routeHarnessesForFiles(POLYGLOT, ["Makefile"]);
    expect(r.fellBackToAll).toBe(true);
  });
});
