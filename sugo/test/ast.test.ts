import { describe, expect, it } from "vitest";
import { detectLanguage, parseFileOutline, supportedLanguages } from "../src/ast/astParser.js";

describe("detectLanguage", () => {
  it("확장자로 언어를 판별한다", () => {
    expect(detectLanguage("a.ts")).toBe("typescript");
    expect(detectLanguage("a.tsx")).toBe("tsx");
    expect(detectLanguage("a.js")).toBe("javascript");
    expect(detectLanguage("a.py")).toBe("python");
    expect(detectLanguage("a.java")).toBe("java");
  });

  it("지원하지 않는 확장자는 null", () => {
    expect(detectLanguage("a.rb")).toBeNull();
    expect(detectLanguage("a.txt")).toBeNull();
  });
});

describe("supportedLanguages", () => {
  it("5개 언어를 지원한다", () => {
    expect(supportedLanguages().sort()).toEqual(["java", "javascript", "python", "tsx", "typescript"].sort());
  });
});

describe("parseFileOutline — TypeScript (실제 AST 파싱)", () => {
  it("클래스/메서드/함수/import를 정확히 추출한다", async () => {
    const source = `
import { readFile } from "node:fs";

export class UserService {
  private readonly repo: string;

  constructor(repo: string) {
    this.repo = repo;
  }

  findById(id: string): string {
    return id;
  }
}

export function createService(repo: string): UserService {
  return new UserService(repo);
}
`;
    const outline = await parseFileOutline("service.ts", source);
    expect(outline).not.toBeNull();
    expect(outline!.language).toBe("typescript");
    expect(outline!.imports.some((i) => i.includes("node:fs"))).toBe(true);

    const classes = outline!.entries.filter((e) => e.kind === "class");
    expect(classes.map((c) => c.name)).toEqual(["UserService"]);

    const methods = outline!.entries.filter((e) => e.kind === "method");
    expect(methods.map((m) => m.name).sort()).toEqual(["constructor", "findById"]);

    const functions = outline!.entries.filter((e) => e.kind === "function");
    expect(functions.map((f) => f.name)).toEqual(["createService"]);
  });

  it("인터페이스도 추출한다", async () => {
    const outline = await parseFileOutline("types.ts", "export interface Config {\n  name: string;\n}\n");
    expect(outline!.entries.filter((e) => e.kind === "interface").map((e) => e.name)).toEqual(["Config"]);
  });

  it("줄번호(startLine/endLine)를 정확히 매긴다", async () => {
    const source = "class Foo {\n  bar() {\n    return 1;\n  }\n}\n";
    const outline = await parseFileOutline("f.ts", source);
    const cls = outline!.entries.find((e) => e.kind === "class")!;
    expect(cls.startLine).toBe(1);
    expect(cls.endLine).toBe(5);
  });
});

describe("parseFileOutline — Python", () => {
  it("클래스 안의 함수는 method로 분류하고, 밖의 함수는 function으로 분류한다", async () => {
    const source = `
import os
from typing import List

class Greeter:
    def greet(self, name):
        return f"hi {name}"

def standalone():
    pass
`;
    const outline = await parseFileOutline("g.py", source);
    expect(outline!.language).toBe("python");
    expect(outline!.imports.length).toBe(2);

    const classes = outline!.entries.filter((e) => e.kind === "class");
    expect(classes.map((c) => c.name)).toEqual(["Greeter"]);

    const methods = outline!.entries.filter((e) => e.kind === "method");
    expect(methods.map((m) => m.name)).toEqual(["greet"]);

    const functions = outline!.entries.filter((e) => e.kind === "function");
    expect(functions.map((f) => f.name)).toEqual(["standalone"]);
  });
});

describe("parseFileOutline — Java", () => {
  it("클래스/인터페이스/메서드/import를 추출한다", async () => {
    const source = `
import java.util.List;

public interface Repository {
  void save(String x);
}

public class UserRepository implements Repository {
  public void save(String x) {
  }
}
`;
    const outline = await parseFileOutline("R.java", source);
    expect(outline!.language).toBe("java");
    expect(outline!.entries.filter((e) => e.kind === "interface").map((e) => e.name)).toEqual(["Repository"]);
    expect(outline!.entries.filter((e) => e.kind === "class").map((e) => e.name)).toEqual(["UserRepository"]);
    expect(outline!.entries.filter((e) => e.kind === "method").map((e) => e.name)).toEqual(["save", "save"]);
  });
});

describe("parseFileOutline — 지원하지 않는 확장자", () => {
  it("null을 반환한다(차단 아님, 스킵)", async () => {
    expect(await parseFileOutline("a.rb", "def foo; end")).toBeNull();
  });
});
