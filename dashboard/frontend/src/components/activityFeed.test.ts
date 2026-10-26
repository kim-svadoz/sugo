import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Inspector Activity 탭", () => {
  it("전체 기록은 메시지를 생략하지 않고 줄바꿈한다", () => {
    const source = readFileSync(new URL("./LiveConsole.tsx", import.meta.url), "utf8");
    expect(source).toContain("<FeedLine key={`${ev.id}-${i}`} ev={ev} expanded />");
    expect(source).toContain('expanded ? "whitespace-pre-wrap break-words" : "truncate"');
  });
});
