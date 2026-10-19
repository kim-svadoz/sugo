import { describe, expect, it } from "vitest";
import { evaluateAutoCheck, parseAutoSpec } from "../src/harness/autoCheck.js";
import type { DetectionContext } from "../src/harness/types.js";

/** 메모리 기반 컨텍스트 — 실제 파일 없이 판정 로직만 검증한다(mock 라이브러리 없이). */
function ctx(files: Record<string, string>, changedFiles: string[] = Object.keys(files)): DetectionContext {
  return {
    projectPath: "/fake",
    changedFiles,
    fileExists: (p) => p in files,
    readFile: (p) => (p in files ? files[p] : null),
    readJson<T>(p: string): T | null {
      const raw = this.readFile(p);
      if (raw === null) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    },
  };
}

describe("parseAutoSpec — 잘못된 선언은 받아들이지 않는다", () => {
  it("auto가 없으면 null(자기보고 체크)", () => {
    expect(parseAutoSpec(undefined)).toBeNull();
    expect(parseAutoSpec(null)).toBeNull();
  });

  it("모르는 kind는 거부한다", () => {
    // 오타난 kind를 조용히 통과시키면 "검증되는 줄 알았는데 아닌" 체크가 생긴다.
    expect(() => parseAutoSpec({ kind: "file-exsits", paths: ["a"] })).toThrow(/kind/);
  });

  it("paths가 비어 있으면 거부한다", () => {
    // 빈 paths는 file-exists에서 "전부 존재"가 공집합이라 항상 통과가 된다 — 가짜 그린.
    expect(() => parseAutoSpec({ kind: "file-exists", paths: [] })).toThrow(/paths/);
  });

  it("file-content-absent에 pattern이 없으면 거부한다", () => {
    expect(() => parseAutoSpec({ kind: "file-content-absent", paths: ["pom.xml"] })).toThrow(/pattern/);
  });

  it("changed-files-content-absent에 pattern이 없으면 거부한다", () => {
    expect(() => parseAutoSpec({ kind: "changed-files-content-absent" })).toThrow(/pattern/);
  });

  it("changed-files-content-absent는 paths가 없어도 받아들인다(대상은 항상 changedFiles)", () => {
    expect(() => parseAutoSpec({ kind: "changed-files-content-absent", pattern: "secret" })).not.toThrow();
  });

  it("깨진 정규식은 선언 시점에 거부한다", () => {
    expect(() => parseAutoSpec({ kind: "file-content-absent", paths: ["a"], pattern: "[unclosed" })).toThrow();
  });

  it("json-field에 비교 기준(equals/in)이 없으면 거부한다", () => {
    expect(() => parseAutoSpec({ kind: "json-field", file: "tsconfig.json", path: "compilerOptions.strict" })).toThrow(/equals|in/);
  });
});

describe("evaluateAutoCheck — file-exists", () => {
  const spec = parseAutoSpec({ kind: "file-exists", paths: ["gradlew", "gradlew.bat"] })!;

  it("전부 있으면 통과", () => {
    expect(evaluateAutoCheck(spec, ctx({ gradlew: "", "gradlew.bat": "" })).passed).toBe(true);
  });

  it("하나라도 없으면 실패하고 어느 것이 없는지 밝힌다", () => {
    const r = evaluateAutoCheck(spec, ctx({ gradlew: "" }));
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("gradlew.bat");
  });
});

describe("evaluateAutoCheck — file-absent", () => {
  const spec = parseAutoSpec({ kind: "file-absent", paths: ["package-lock.json", "yarn.lock"] })!;

  it("둘 다 없으면 통과", () => {
    expect(evaluateAutoCheck(spec, ctx({ "pnpm-lock.yaml": "" })).passed).toBe(true);
  });

  it("하나라도 있으면 실패한다(lockfile 혼용)", () => {
    const r = evaluateAutoCheck(spec, ctx({ "pnpm-lock.yaml": "", "yarn.lock": "" }));
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("yarn.lock");
  });
});

describe("evaluateAutoCheck — file-content-absent", () => {
  const spec = parseAutoSpec({
    kind: "file-content-absent",
    paths: ["pom.xml"],
    pattern: "(-DskipTests|maven\\.test\\.skip)",
  })!;

  it("금지 문자열이 없으면 통과", () => {
    expect(evaluateAutoCheck(spec, ctx({ "pom.xml": "<project><build/></project>" })).passed).toBe(true);
  });

  it("금지 문자열이 있으면 실패한다", () => {
    const r = evaluateAutoCheck(spec, ctx({ "pom.xml": "<properties><maven.test.skip>true</maven.test.skip></properties>" }));
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("pom.xml");
  });

  it("대상 파일이 아예 없으면 통과한다(위반할 내용 자체가 없음)", () => {
    expect(evaluateAutoCheck(spec, ctx({})).passed).toBe(true);
  });
});

describe("evaluateAutoCheck — changed-files-content-absent", () => {
  const spec = parseAutoSpec({
    kind: "changed-files-content-absent",
    pattern: "(api[_-]?key|secret|password)\\s*[:=]\\s*[\"'][A-Za-z0-9_\\-]{8,}[\"']",
  })!;

  it("변경 파일에 하드코딩된 시크릿이 없으면 통과한다", () => {
    const c = ctx({ "src/config.ts": "export const timeout = 3000;" });
    expect(evaluateAutoCheck(spec, c).passed).toBe(true);
  });

  it("변경 파일에 하드코딩된 시크릿이 있으면 실패하고 어느 파일인지 밝힌다", () => {
    const c = ctx({ "src/config.ts": 'const apiKey = "sk-abcdef1234567890";' });
    const r = evaluateAutoCheck(spec, c);
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("src/config.ts");
  });

  it("고정 paths가 아니라 changedFiles를 본다 — 프로젝트에 다른 시크릿 파일이 있어도 이번 diff에 없으면 통과", () => {
    // ctx()의 파일 시스템엔 시크릿이 있지만, changedFiles로 지목한 파일은 다른 것이다.
    const c = ctx(
      { "src/config.ts": "export const timeout = 3000;", "src/legacy-secret.ts": 'const password = "hunter22222222";' },
      ["src/config.ts"],
    );
    expect(evaluateAutoCheck(spec, c).passed).toBe(true);
  });

  it("changedFiles가 비어 있으면 위반할 대상 자체가 없어 통과한다", () => {
    const c = ctx({ "src/config.ts": 'const apiKey = "sk-abcdef1234567890";' }, []);
    expect(evaluateAutoCheck(spec, c).passed).toBe(true);
  });

  it("여러 파일이 위반하면 전부 나열한다", () => {
    const c = ctx({
      "a.ts": 'const apiKey = "sk-abcdef1234567890";',
      "b.ts": 'const secret = "topsecret123456";',
    });
    const r = evaluateAutoCheck(spec, c);
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("a.ts");
    expect(r.detail).toContain("b.ts");
  });
});

describe("evaluateAutoCheck — json-field", () => {
  it("equals: 값이 같으면 통과", () => {
    const spec = parseAutoSpec({ kind: "json-field", file: "tsconfig.json", path: "compilerOptions.strict", equals: true })!;
    expect(evaluateAutoCheck(spec, ctx({ "tsconfig.json": '{"compilerOptions":{"strict":true}}' })).passed).toBe(true);
  });

  it("equals: 값이 다르면 실패(strict를 꺼서 타입에러를 회피한 경우)", () => {
    const spec = parseAutoSpec({ kind: "json-field", file: "tsconfig.json", path: "compilerOptions.strict", equals: true })!;
    const r = evaluateAutoCheck(spec, ctx({ "tsconfig.json": '{"compilerOptions":{"strict":false}}' }));
    expect(r.passed).toBe(false);
    expect(r.detail).toContain("false");
  });

  it("필드가 아예 없으면 실패한다(있다고 가정하지 않는다)", () => {
    const spec = parseAutoSpec({ kind: "json-field", file: "tsconfig.json", path: "compilerOptions.strict", equals: true })!;
    const r = evaluateAutoCheck(spec, ctx({ "tsconfig.json": "{}" }));
    expect(r.passed).toBe(false);
  });

  it("in: 허용 목록 안이면 통과, 밖이면 실패", () => {
    const spec = parseAutoSpec({
      kind: "json-field",
      file: "tsconfig.json",
      path: "compilerOptions.moduleResolution",
      in: ["bundler", "node16", "nodenext"],
    })!;
    expect(evaluateAutoCheck(spec, ctx({ "tsconfig.json": '{"compilerOptions":{"moduleResolution":"bundler"}}' })).passed).toBe(true);
    expect(evaluateAutoCheck(spec, ctx({ "tsconfig.json": '{"compilerOptions":{"moduleResolution":"node"}}' })).passed).toBe(false);
  });

  it("JSON이 깨져 있으면 통과로 넘기지 않는다", () => {
    // 파싱 실패를 통과로 처리하면 파일을 망가뜨리는 것이 게이트 우회 수단이 된다.
    const spec = parseAutoSpec({ kind: "json-field", file: "tsconfig.json", path: "compilerOptions.strict", equals: true })!;
    const r = evaluateAutoCheck(spec, ctx({ "tsconfig.json": "{ broken" }));
    expect(r.passed).toBe(false);
    expect(r.detail).toMatch(/읽|파싱/);
  });

  it("대상 파일이 없으면 통과로 넘기지 않는다", () => {
    // tsconfig.json을 지우면 strict 검사가 사라지는 식의 우회를 막는다.
    const spec = parseAutoSpec({ kind: "json-field", file: "tsconfig.json", path: "compilerOptions.strict", equals: true })!;
    expect(evaluateAutoCheck(spec, ctx({})).passed).toBe(false);
  });
});
