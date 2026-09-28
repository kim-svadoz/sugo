import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("LiveConsole full-screen modal", () => {
  it("하단 패널의 overflow에 잘리지 않도록 document.body portal을 사용한다", () => {
    const source = readFileSync(new URL("./LiveConsole.tsx", import.meta.url), "utf8");
    expect(source).toContain('import { createPortal } from "react-dom"');
    expect(source).toContain("createPortal(");
    expect(source).toContain("document.body");
  });

  it("전체 콘솔에서는 메시지를 생략하지 않고 줄바꿈한다", () => {
    const source = readFileSync(new URL("./LiveConsole.tsx", import.meta.url), "utf8");
    expect(source).toContain("renderFeed(true)");
    expect(source).toContain('expanded ? "whitespace-pre-wrap break-words" : "truncate"');
  });
});
