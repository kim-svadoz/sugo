import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Console 기본 화면 스케일", () => {
  it("브라우저 100%에서 기존 110% 수준의 기본 크기를 제공한다", () => {
    const css = fs.readFileSync(path.resolve("src/index.css"), "utf8");
    expect(css).toContain("html { font-size: 21px; }");
    expect(css).toMatch(/body\s*\{[^}]*zoom:\s*1\.1;/s);
    expect(css).toContain('[class~="text-[10px]"] { font-size: 11px !important; }');
    expect(css).toContain('[class~="text-[13px]"] { font-size: 14px !important; }');
  });

  it("확대된 셸이 viewport 아래로 잘리지 않는다", () => {
    const source = fs.readFileSync(path.resolve("src/components/Layout.tsx"), "utf8");
    expect(source).toContain("h-[calc(100vh/1.1)]");
  });
});
