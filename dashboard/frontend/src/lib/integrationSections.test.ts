import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Integrations section navigation", () => {
  it("연동 구조에서 하나의 대상을 선택해 상세 화면을 전환한다", () => {
    const source = readFileSync(new URL("../pages/Settings.tsx", import.meta.url), "utf8");
    expect(source).toContain('useState<IntegrationViewId>("registration")');
    expect(source).toContain('aria-label="외부 연동 단계"');
    expect(source).toContain('label: "프로젝트"');
    expect(source).toContain('label: "외부 서비스"');
    expect(source).toContain('label: "연결 현황"');
    expect(source).toContain('description: "로컬 프로젝트 등록"');
    expect(source).toContain('label: "PR 작업"');
    expect(source).toContain('label: "서비스 상태"');
    expect(source).toContain('label: "모니터링"');
    expect(source).toContain('provider.id === "github" || provider.id === "aws_codecommit"');
    expect(source).toContain("AWS 자격 증명으로 PR 권한 연결");
    expect(source).toContain("AWS 연결");
    expect(source).toContain("Pinpoint APM");
    expect(source).toContain("statusOnly");
    expect(source.indexOf("!registrationOnly && statusOnly")).toBeLessThan(source.indexOf("!registrationOnly && !statusOnly && <>"));
    expect(source).toContain('selectedSection === "serviceMapping"');
    expect(source).toContain('selectedSection === "overview"');
    expect(source).toContain("서비스 연동 미사용");
    expect(source).toContain("서비스 추가");
  });
});
