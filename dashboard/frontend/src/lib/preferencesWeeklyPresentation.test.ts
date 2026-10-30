import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("weekly preferences presentation", () => {
  it("uses the same heading typography as the other preference tabs", () => {
    const source = readFileSync(new URL("../pages/Preferences.tsx", import.meta.url), "utf8");

    expect(source).toContain('<h2 className="text-base font-semibold text-slate-100">자동 주간 정리</h2>');
    expect(source).toContain('<p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">정한 요일과 시각에 실행</p>');
  });
});
