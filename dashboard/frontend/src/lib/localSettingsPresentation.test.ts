import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("local Settings presentation", () => {
  it("hides manual plugin token management and keeps AWS sync guidance on the action", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Settings.tsx"), "utf8");
    expect(source).toContain("!LOCAL_DEV && <ApiTokensCard />");
    const aws = source.slice(source.indexOf("function AwsContextCard"), source.indexOf("function AwsAccessPolicySettings"));
    expect(aws).toContain("AWS 전체 동기화");
    expect(aws.indexOf("AWS 전체 동기화")).toBeLessThan(aws.indexOf("연결됨"));
    expect(aws).not.toContain("status.inventory");
    expect(aws).toContain("AWS 조회 정책");
    expect(source).toContain("꺼져 있었다면 다음에 켜질 때 동기화");
  });

  it("Pinpoint 동기화 안내도 버튼 도움말에 둔다", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Settings.tsx"), "utf8");
    const pinpoint = source.slice(source.indexOf("function PinpointContextCard"), source.indexOf("function ProjectIntegrationsCard"));
    const header = pinpoint.slice(pinpoint.indexOf("Pinpoint APM</h2>"), pinpoint.indexOf("{expanded && <div"));
    expect(header).toContain("Pinpoint 동기화");
    expect(header).toContain("contextAutoRefreshDescription");
  });

  it("keeps registration projects inside domain choices and states PR authentication purpose", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Settings.tsx"), "utf8");
    expect(source).toContain("groupProjectsByWorkspace(projects)");
    expect(source).not.toContain('id="registered-projects-title"');
    expect(source).toContain("GitHub 액세스 토큰으로 PR 권한 연결");
    expect(source).toContain("서비스 ID와 클러스터를 저장해 정확히 연결합니다");
  });
});
