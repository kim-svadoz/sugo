import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Integrations section navigation", () => {
  it("다섯 설정 카드는 기본으로 접히고 상단 탭은 펼침 상태를 바꾸지 않는다", () => {
    const source = readFileSync(new URL("../pages/Settings.tsx", import.meta.url), "utf8");
    expect(source).toContain("INTEGRATION_SECTIONS");
    expect(source).toContain('useState<IntegrationSectionId | null>(null)');
    const openSection = source.match(/function openSection[\s\S]*?\n  }/)?.[0] ?? "";
    expect(openSection).not.toContain("setExpandedSection");
    expect(source).toContain("AWS Context");
    expect(source).toContain("AWS 직접 조회 안전장치");
    expect(source).toContain("Pinpoint APM");
    expect(source).toContain("프로젝트 외부 연동");
    expect(source).toContain("Git 서비스 연결");
  });
});
