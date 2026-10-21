import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Integrations section navigation", () => {
  it("다섯 설정 카드는 상단 탭과 단일 펼침 상태를 사용한다", () => {
    const source = readFileSync(new URL("../pages/Settings.tsx", import.meta.url), "utf8");
    expect(source).toContain("INTEGRATION_SECTIONS");
    expect(source).toContain("expandedSection");
    expect(source).toContain("AWS Context");
    expect(source).toContain("AWS 직접 조회 안전장치");
    expect(source).toContain("Pinpoint APM");
    expect(source).toContain("프로젝트 외부 연동");
    expect(source).toContain("Git 서비스 연결");
  });
});
