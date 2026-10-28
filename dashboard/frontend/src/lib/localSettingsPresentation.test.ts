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

  it("renders existing domains as a browser with a stable project detail pane", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Settings.tsx"), "utf8");
    expect(source).not.toContain("domainProjects.join(' · ')");
    expect(source).toContain("selectedDomainProjects.map((projectName)");
    expect(source).toContain('aria-label="선택한 도메인의 등록 프로젝트"');
    expect(source).toContain('aria-label="도메인 브라우저"');
    expect(source).toContain('sm:grid-cols-[16rem_minmax(0,1fr)]');
  });

  it("guides service mapping from project selection and handles AWS availability", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Settings.tsx"), "utf8");
    const mapping = source.slice(source.indexOf("function ProjectIntegrationsCard"), source.indexOf("function ApiTokensCard"));
    expect(mapping).toContain("serviceStepComplete ? <Check");
    expect(mapping).toContain("운영 서비스 연결");
    expect(mapping).not.toContain("03</span><strong");
    expect(mapping).not.toContain("ECS 서비스 추가");
    expect(mapping).toContain("AWS 계정을 연결하세요");
    expect(mapping).toContain("연결 가능한 운영 서비스가 없습니다");
    expect(mapping).not.toContain("border-dashed border-cyan-300/35");
    expect(mapping).toContain("serviceStepRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })");
    expect(mapping).toContain("projectSelectionComplete ? <Check");
    expect(mapping).toContain('ref={serviceStepRef}');
    expect(mapping).toContain("projectSelectionComplete && path === item.project_path");
    expect(mapping).toContain('aria-label="서비스 연결 프로젝트 브라우저"');
    expect(mapping).not.toContain("item.workspace_name} · {integrationStatusLabel(item)");
    expect(mapping).toContain("function selectServiceWorkspace(workspace: string)");
    expect(mapping).toContain("onClick={() => selectServiceWorkspace(workspace)}");
    expect(mapping).toContain("setProjectSelectionComplete(false)");
    expect(mapping).toContain("setSelected([])");
  });

  it("separates repository, PR, service health, and APM status", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Settings.tsx"), "utf8");
    const overview = source.slice(source.indexOf("function ProjectGitConnections"), source.indexOf("export function Settings"));
    expect(overview).toContain("원격 저장소");
    expect(overview).toContain("PR 연동");
    expect(overview).toContain("서비스 상태 관리");
    expect(overview).toContain("APM 관리");
    expect(overview).toContain("Pinpoint");
    expect(overview).not.toContain("ECS/APM");
    expect(overview).toContain('<table className="w-full min-w-[1080px] table-fixed text-left">');
    expect(overview).toContain('scope="rowgroup"');
    expect(overview).toContain('left.name.localeCompare(right.name)');
    expect(overview).toContain('title={project.project_path}');
    expect(overview).not.toContain('className="mt-4 grid gap-px');
    expect(overview).not.toContain("origin 없음");
    expect(overview).not.toContain("권한 미설정");
    expect(overview).not.toContain("원격 저장소 없음");
    expect(overview).not.toContain("연결 없음");
  });

  it("describes the registration destination as a Sugo workspace", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Settings.tsx"), "utf8");
    expect(source).toContain("Sugo 작업공간 ·");
    expect(source).not.toContain("등록 예정 ·");
  });

  it("uses larger labels for the three integration stages", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Settings.tsx"), "utf8");
    const stages = source.slice(source.indexOf('aria-label="외부 연동 단계"'), source.indexOf('{activeGroup === "services"'));
    expect(stages).toContain('<strong className="text-base');
  });
});
