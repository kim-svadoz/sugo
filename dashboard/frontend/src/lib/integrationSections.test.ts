import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Integrations section navigation", () => {
  it("연동 구조에서 하나의 대상을 선택해 상세 화면을 전환한다", () => {
    const source = readFileSync(new URL("../pages/Settings.tsx", import.meta.url), "utf8");
    expect(source).toContain("INTEGRATION_SECTIONS");
    expect(source).toContain('useState<IntegrationViewId>("overview")');
    expect(source).toContain('aria-label="연동 설정"');
    expect(source).toContain("summarizeRepositoryConnections");
    expect(source).toContain('label: "프로젝트 등록"');
    expect(source).toContain('label: "코드 저장소"');
    expect(source).toContain('label: "서비스 상태"');
    expect(source).toContain('label: `모니터링');
    expect(source).toContain("● 연결됨");
    expect(source).toContain("로컬 Git은 준비됐습니다");
    expect(source).toContain("프로젝트별 연결");
    expect(source).toContain("Git remote를 감지했습니다");
    expect(source).toContain("원격 저장소 작업 권한");
    expect(source).toContain('label: "코드 저장소"');
    expect(source).not.toContain('label: "프로젝트 매핑"');
    expect(source).toContain('label: "저장소 작업 권한"');
    expect(source).toContain("필요한 운영 도구만 연결하세요");
    expect(source).toContain("AWS Context");
    expect(source).toContain("AWS 읽기 범위");
    expect(source).toContain("<AwsAccessPolicySettings />");
    expect(source).toContain("Pinpoint APM");
    expect(source).toContain("배포 서비스 연결");
    expect(source.indexOf('id: "pinpoint"')).toBeLessThan(source.indexOf('id: "projects"'));
    expect(source).not.toContain('id: "guard"');
  });
});
