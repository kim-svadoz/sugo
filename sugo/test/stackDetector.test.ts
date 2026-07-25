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
    expect(stack.frameworks.map((f) => f.id).sort()).toEqual(["framework/node", "framework/react"]);
    expect(stack.buildTools.map((b) => b.id)).toEqual(["buildtool/npm"]);
    expect(stack.harnessIds.sort()).toEqual(
      ["lang/typescript", "framework/node", "framework/react", "buildtool/npm"].sort(),
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
  it("스프링 버전을 major bucket으로 harnessId에 반영한다", () => {
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

    expect(stack.languages.map((l) => l.id)).toEqual(["lang/java"]);
    expect(stack.frameworks.map((f) => f.id)).toEqual(["framework/spring/3.x"]);
    expect(stack.buildTools.map((b) => b.id)).toEqual(["buildtool/maven"]);
    expect(stack.commands.build).toBe("mvn compile");
    expect(stack.commands.test).toBe("mvn test");
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
