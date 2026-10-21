import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("날씨 생활권 선택", () => {
  it("긴 기본 select 대신 제한 높이의 지역 선택 패널을 사용한다", () => {
    const source = readFileSync(new URL("../pages/Preferences.tsx", import.meta.url), "utf8");
    expect(source).toContain("regionPickerOpen");
    expect(source).toContain("생활권");
    expect(source).toContain("max-h-64");
    expect(source).not.toContain("<select");
  });
});
