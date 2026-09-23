import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("workspace card hover chrome", () => {
  it("hover가 도메인 카드의 테두리 색을 바꾸지 않는다", () => {
    const css = readFileSync(new URL("../index.css", import.meta.url), "utf8");
    const hoverRule = css.match(/\.ck-card:hover\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(hoverRule).not.toContain("border-color");
  });
});
