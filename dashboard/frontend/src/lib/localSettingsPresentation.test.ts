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
    expect(source).toContain("AWS ECS");
  });

  it("renders projects in the selected domain as separate readable rows", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Settings.tsx"), "utf8");
    expect(source).not.toContain("domainProjects.join(' · ')");
    expect(source).toContain("등록 프로젝트");
    expect(source).toContain("domainProjects.map((projectName)");
  });

  it("guides service mapping from project selection and handles AWS availability", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Settings.tsx"), "utf8");
    const mapping = source.slice(source.indexOf("function ProjectIntegrationsCard"), source.indexOf("function ApiTokensCard"));
    expect(mapping).toContain("02</span><strong");
    expect(mapping).toContain("운영 서비스 연결");
    expect(mapping).not.toContain("03</span><strong");
    expect(mapping).not.toContain("ECS 서비스 추가");
    expect(mapping).toContain("AWS 계정을 연결하세요");
    expect(mapping).toContain("연결 가능한 운영 서비스가 없습니다");
    expect(mapping).toContain("animate-pulse");
  });
});
