import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Console 기본 화면 스케일", () => {
  it("브라우저 100%에서 기존 110% 수준의 기본 크기를 제공한다", () => {
    const css = fs.readFileSync(path.resolve("src/index.css"), "utf8");
    expect(css).toContain("html { font-size: 21px; }");
    expect(css).toContain('[class~="text-[10px]"] { font-size: 11px !important; }');
    expect(css).toContain('[class~="text-[13px]"] { font-size: 14px !important; }');
  });
});
