import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("전역 단축키 전파", () => {
  it("화면에서 이미 처리한 Cmd+S는 전역 Skills 이동으로 다시 처리하지 않는다", () => {
    const source = readFileSync(new URL("../components/Layout.tsx", import.meta.url), "utf8");
    expect(source).toContain("if (e.defaultPrevented) return");
  });
});
