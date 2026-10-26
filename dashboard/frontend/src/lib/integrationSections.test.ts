import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Integrations section navigation", () => {
  it("연동 구조에서 하나의 대상을 선택해 상세 화면을 전환한다", () => {
    const source = readFileSync(new URL("../pages/Settings.tsx", import.meta.url), "utf8");
    expect(source).toContain("INTEGRATION_SECTIONS");
    expect(source).toContain('useState<IntegrationViewId>("git")');
    expect(source).toContain('aria-label="외부 연동 구조"');
    expect(source).toContain("selected={selectedSection === section.id}");
    expect(source).toContain("activeSourceSections");
    expect(source).toContain("hasOptionalConnection");
    expect(source).toContain("필요한 운영 도구만 연결하세요");
    expect(source).toContain("AWS Context");
    expect(source).toContain("AWS 직접 조회 안전장치");
    expect(source).toContain("Pinpoint APM");
    expect(source).toContain("프로젝트 외부 연동");
    expect(source).toContain("Git 작업 경로");
    expect(source).toContain("CONNECTED SOURCES");
    expect(source).toContain("CONTROL PLANE");
    expect(source.indexOf('id: "pinpoint"')).toBeLessThan(source.indexOf('id: "projects"'));
    expect(source.indexOf('id: "projects"')).toBeLessThan(source.indexOf('id: "guard"'));
  });
});
