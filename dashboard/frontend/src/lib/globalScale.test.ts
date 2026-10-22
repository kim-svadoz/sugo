import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Console 기본 화면 스케일", () => {
  it("브라우저 100%에서 기존 110% 수준의 기본 크기를 제공한다", () => {
    const css = fs.readFileSync(path.resolve("src/index.css"), "utf8");
    expect(css).toMatch(/html\s*\{[^}]*font-size:\s*21px;/s);
    expect(css).toMatch(/body\s*\{[^}]*zoom:\s*1\.1;/s);
    expect(css).toContain('[class~="text-[10px]"] { font-size: 11px !important; }');
    expect(css).toContain('[class~="text-[13px]"] { font-size: 14px !important; }');
  });

  it("확대된 셸이 viewport 아래로 잘리지 않는다", () => {
    const css = fs.readFileSync(path.resolve("src/index.css"), "utf8");
    const source = fs.readFileSync(path.resolve("src/components/Layout.tsx"), "utf8");
    expect(source).toContain("h-full min-h-0");
    expect(source).not.toContain("h-[calc(100vh/1.1)]");
    expect(css).toMatch(/html\s*\{[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/body\s*\{[^}]*height:\s*calc\(100vh\s*\/\s*1\.1\);[^}]*overflow:\s*hidden;/s);
    expect(css).toMatch(/#root\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s);
    expect(css).not.toContain("#root { min-height: 100vh; }");
  });
});
