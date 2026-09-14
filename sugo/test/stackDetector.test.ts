import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectStack } from "../src/harness/stackDetector.js";

let tmpDirs: string[] = [];

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "sugo-detect-"));
  tmpDirs.push(dir);
  return dir;
}

function write(dir: string, relPath: string, content: string) {
  const full = join(dir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content, "utf-8");
}

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

describe("detectStack — Node + TypeScript + React 프로젝트", () => {
  it("언어/프레임워크/빌드도구/명령을 정확히 감지한다", () => {
    const dir = makeProject();
    write(
      dir,
      "package.json",
      JSON.stringify({
        dependencies: { react: "^18.2.0" },
        devDependencies: { typescript: "^5.4.0" },
        scripts: { build: "tsc", test: "vitest run" },
      }),
    );
    write(dir, "tsconfig.json", "{}");
    write(dir, "package-lock.json", "{}");

    const stack = detectStack(dir);

    expect(stack.languages.map((l) => l.id)).toEqual(["lang/typescript"]);
    expect(stack.languages[0].version).toBe("^5.4.0");
    expect(stack.frameworks.map((f) => f.id).sort()).toEqual([
      "framework/node",
      "framework/react",
      "framework/react/18.x",
    ]);
    expect(stack.buildTools.map((b) => b.id)).toEqual(["buildtool/npm"]);
    expect(stack.harnessIds.sort()).toEqual(
      ["lang/typescript", "framework/node", "framework/react", "framework/react/18.x", "buildtool/npm"].sort(),
    );
    expect(stack.commands.build).toBe("npm run build");
    expect(stack.commands.test).toBe("npm run test");
    expect(stack.commands.format).toBeUndefined();
  });

  it("tsconfig.json이 없으면 lang/javascript로 감지한다", () => {
    const dir = makeProject();
    write(dir, "package.json", JSON.stringify({}));
    const stack = detectStack(dir);
    expect(stack.languages.map((l) => l.id)).toEqual(["lang/javascript"]);
  });
});

describe("detectStack — Java + Spring Boot + Maven 프로젝트", () => {
  it("스프링 버전을 major bucket으로 harnessId에 반영하되 base도 함께 낸다", () => {
    const dir = makeProject();
    write(
      dir,
      "pom.xml",
      `<project>
        <parent>
          <artifactId>spring-boot-starter-parent</artifactId>
          <version>3.2.4</version>
        </parent>
      </project>`,
    );
    const stack = detectStack(dir);

    // 버전 하네스는 델타라서 base와 함께 나가야 한다 — 버전 id만 내면 fetcher가 정확매치에
    // 성공해 base 폴백을 안 타고, 공통 규칙이 통째로 빠진다.
    expect(stack.languages.map((l) => l.id)).toEqual(["lang/java"]);
    expect(stack.frameworks.map((f) => f.id)).toEqual(["framework/spring", "framework/spring/3.x"]);
    expect(stack.buildTools.map((b) => b.id)).toEqual(["buildtool/maven"]);
    expect(stack.commands.build).toBe("mvn compile");
    expect(stack.commands.test).toBe("mvn test");
  });

  it("Spring Boot 4는 4.x 버킷으로, 2는 2.x 버킷으로 간다", () => {
    const boot4 = makeProject();
    write(boot4, "pom.xml", "<project><properties><spring-boot.version>4.0.1</spring-boot.version></properties></project>");
    expect(detectStack(boot4).frameworks.map((f) => f.id)).toEqual([
      "framework/spring",
      "framework/spring/4.x",
    ]);

    const boot2 = makeProject();
    write(boot2, "build.gradle", `id 'org.springframework.boot' version '2.7.18'`);
    expect(detectStack(boot2).frameworks.map((f) => f.id)).toEqual([
      "framework/spring",
      "framework/spring/2.x",
    ]);
  });

  it("Java 버전을 pom/gradle에서 읽어 LTS 버킷으로 내린다", () => {
    const maven17 = makeProject();
    write(maven17, "pom.xml", "<project><properties><java.version>17</java.version></properties></project>");
    expect(detectStack(maven17).languages.map((l) => l.id)).toEqual(["lang/java", "lang/java/17"]);

    const gradle21 = makeProject();
    write(gradle21, "build.gradle", "java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }");
    expect(detectStack(gradle21).languages.map((l) => l.id)).toEqual(["lang/java", "lang/java/21"]);

    // 1.8 표기 → 8, 비-LTS 26 → 그 이하 최신 LTS인 25로 흡수
    const legacy8 = makeProject();
    write(legacy8, "pom.xml", "<project><properties><maven.compiler.source>1.8</maven.compiler.source></properties></project>");
    expect(detectStack(legacy8).languages.map((l) => l.id)).toEqual(["lang/java", "lang/java/8"]);

    const java26 = makeProject();
    write(java26, "pom.xml", "<project><properties><java.version>26</java.version></properties></project>");
    expect(detectStack(java26).languages.map((l) => l.id)).toEqual(["lang/java", "lang/java/25"]);
  });

  it("Java 버전 표기가 없으면 base 하네스만 적용한다", () => {
    const dir = makeProject();
    write(dir, "pom.xml", "<project></project>");
    expect(detectStack(dir).languages.map((l) => l.id)).toEqual(["lang/java"]);
  });

  it("mvnw wrapper가 있으면 mvnw로 명령을 만든다", () => {
    const dir = makeProject();
    write(dir, "pom.xml", "<project></project>");
    write(dir, "mvnw", "#!/bin/sh");
    const stack = detectStack(dir);
    expect(stack.commands.build).toBe("./mvnw compile");
  });
});

describe("detectStack — Python 프로젝트", () => {
  it("requirements.txt만 있으면 pip + pytest로 감지한다", () => {
    const dir = makeProject();
    write(dir, "requirements.txt", "flask==3.0.0\n");
    const stack = detectStack(dir);
    expect(stack.languages.map((l) => l.id)).toEqual(["lang/python"]);
    expect(stack.buildTools.map((b) => b.id)).toEqual(["buildtool/pip"]);
    expect(stack.commands.test).toBe("pytest");
  });

  it("pyproject.toml에 [tool.poetry]가 있으면 poetry로 감지한다", () => {
    const dir = makeProject();
    write(dir, "pyproject.toml", "[tool.poetry]\nname = \"demo\"\n");
    const stack = detectStack(dir);
    expect(stack.buildTools.map((b) => b.id)).toEqual(["buildtool/poetry"]);
    expect(stack.commands.test).toBe("poetry run pytest");
  });

  it("requires-python / poetry python / .python-version에서 버전 버킷을 잡는다", () => {
    const requires = makeProject();
    write(requires, "pyproject.toml", "[project]\nrequires-python = \">=3.12\"\n");
    expect(detectStack(requires).languages.map((l) => l.id)).toEqual(["lang/python", "lang/python/3.12"]);

    const poetry = makeProject();
    write(poetry, "pyproject.toml", "[tool.poetry.dependencies]\npython = \"^3.14\"\n");
    expect(detectStack(poetry).languages.map((l) => l.id)).toEqual(["lang/python", "lang/python/3.14"]);

    // 3.11은 3.12 버킷에 못 미치므로 그 아래인 3.10 버킷으로 내려간다
    const pinned = makeProject();
    write(pinned, "requirements.txt", "flask==3.0.0\n");
    write(pinned, ".python-version", "3.11.9\n");
    expect(detectStack(pinned).languages.map((l) => l.id)).toEqual(["lang/python", "lang/python/3.10"]);
  });
});

describe("detectStack — Next.js", () => {
  it("next 의존성을 감지하고 major를 버킷으로 잡는다", () => {
    const dir = makeProject();
    write(dir, "package.json", JSON.stringify({ dependencies: { next: "16.3.5", react: "^19.2.0" } }));
    write(dir, "tsconfig.json", "{}");
    const stack = detectStack(dir);

    expect(stack.frameworks.map((f) => f.id).sort()).toEqual(
      ["framework/node", "framework/nextjs", "framework/nextjs/16.x", "framework/react", "framework/react/19.x"].sort(),
    );
  });

  it("app 디렉터리가 있으면 App Router로 표기한다", () => {
    const dir = makeProject();
    write(dir, "package.json", JSON.stringify({ dependencies: { next: "^15.0.0" } }));
    write(dir, "app/page.tsx", "export default function Page() { return null; }\n");
    const next = detectStack(dir).frameworks.find((f) => f.id === "framework/nextjs");
    expect(next?.name).toBe("Next.js (App Router)");
  });

  it("next가 없으면 nextjs 하네스를 붙이지 않는다", () => {
    const dir = makeProject();
    write(dir, "package.json", JSON.stringify({ dependencies: { react: "^19.0.0" } }));
    expect(detectStack(dir).harnessIds).not.toContain("framework/nextjs");
  });
});

describe("detectStack — 데이터스토어/인프라(정보성, harnessId 미포함)", () => {
  it("postgres 의존성과 Dockerfile을 감지하지만 harnessIds에는 넣지 않는다", () => {
    const dir = makeProject();
    write(dir, "package.json", JSON.stringify({ dependencies: { pg: "^8.11.0" } }));
    write(dir, "Dockerfile", "FROM node:20\n");
    const stack = detectStack(dir);

    expect(stack.dataStores.map((d) => d.id)).toEqual(["datastore/postgres"]);
    expect(stack.infra.map((i) => i.id)).toEqual(["infra/docker"]);
    expect(stack.harnessIds).not.toContain("datastore/postgres");
    expect(stack.harnessIds).not.toContain("infra/docker");
  });
});

describe("detectStack — 감지할 마커가 전혀 없는 프로젝트", () => {
  it("모든 카테고리가 빈 배열이다", () => {
    const dir = makeProject();
    const stack = detectStack(dir);
    expect(stack.languages).toEqual([]);
    expect(stack.frameworks).toEqual([]);
    expect(stack.buildTools).toEqual([]);
    expect(stack.harnessIds).toEqual([]);
  });
});
