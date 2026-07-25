import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { walkSourceFiles } from "../src/overview.js";

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), "sugo-overview-"));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("walkSourceFiles", () => {
  it("지원 언어 소스파일만 찾는다", async () => {
    writeFileSync(join(projectDir, "a.ts"), "export const a = 1;");
    writeFileSync(join(projectDir, "readme.md"), "# hi");
    const files = await walkSourceFiles(projectDir, 100);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("a.ts");
  });

  it("node_modules/dist/sugo/.claude 등은 건너뛴다", async () => {
    mkdirSync(join(projectDir, "node_modules"), { recursive: true });
    writeFileSync(join(projectDir, "node_modules", "dep.js"), "x");
    mkdirSync(join(projectDir, "sugo"), { recursive: true });
    writeFileSync(join(projectDir, "sugo", "harness.js"), "x");
    writeFileSync(join(projectDir, "real.js"), "x");
    const files = await walkSourceFiles(projectDir, 100);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain("real.js");
  });

  it(".git 등 숨김 디렉터리는 건너뛴다", async () => {
    mkdirSync(join(projectDir, ".git"), { recursive: true });
    writeFileSync(join(projectDir, ".git", "hook.py"), "x");
    writeFileSync(join(projectDir, "main.py"), "x");
    const files = await walkSourceFiles(projectDir, 100);
    expect(files).toHaveLength(1);
  });

  it("하위 디렉터리까지 재귀적으로 찾는다", async () => {
    mkdirSync(join(projectDir, "src", "nested"), { recursive: true });
    writeFileSync(join(projectDir, "src", "nested", "deep.ts"), "x");
    const files = await walkSourceFiles(projectDir, 100);
    expect(files).toHaveLength(1);
  });

  it("maxFiles에 도달하면 멈춘다", async () => {
    for (let i = 0; i < 10; i++) writeFileSync(join(projectDir, `f${i}.js`), "x");
    const files = await walkSourceFiles(projectDir, 3);
    expect(files).toHaveLength(3);
  });

  it("존재하지 않는 디렉터리는 빈 배열", async () => {
    const files = await walkSourceFiles(join(projectDir, "nope"), 100);
    expect(files).toEqual([]);
  });
});
