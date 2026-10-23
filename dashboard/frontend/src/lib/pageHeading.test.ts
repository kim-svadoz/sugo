import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("page heading typography", () => {
  it("주요 탭은 영문 보조 헤더와 한글 주 헤더의 공통 컴포넌트를 사용한다", () => {
    for (const page of ["SchedulePage", "WeeklyPage", "Skills", "Playbook", "Harness", "Settings", "Preferences"]) {
      const source = readFileSync(new URL(`../pages/${page}.tsx`, import.meta.url), "utf8");
      expect(source, page).toContain("PageHeading");
    }
  });

  it("워크스페이스는 중복 Domains 행 없이 제목과 운영 도구를 한 줄에 배치한다", () => {
    const source = readFileSync(new URL("../pages/Sessions.tsx", import.meta.url), "utf8");
    expect(source).toContain("워크스페이스 운영 도구");
    expect(source).toContain("WORKSPACE OPERATIONS");
    expect(source).toContain("도메인 관리");
    expect(source).not.toContain("Domains <span");
    expect(source).not.toContain("전체 워크스페이스 운영 현황");
  });

  it("Home 이외의 상단 헤더는 여러 Sugo 활용 팁을 순환한다", () => {
    const source = readFileSync(new URL("../components/Header.tsx", import.meta.url), "utf8");
    expect(readFileSync(new URL("./pageTips.ts", import.meta.url), "utf8")).toContain("PAGE_TIPS");
    expect(source).toContain("tipsForPath(pathname)");
    expect(source).toContain("7_000");
    expect(source).toContain("Sugo 활용 팁");
    expect(source).toContain("text-amber-300");
    expect(source).not.toContain('>TIP</span>');
  });

  it("Home에서 연 SPEC 상세는 닫을 때 Home으로 돌아간다", () => {
    const home = readFileSync(new URL("../pages/Home.tsx", import.meta.url), "utf8");
    const schedule = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(home).toContain("returnTo=home");
    expect(schedule).toContain('searchParams.get("returnTo")');
    expect(schedule).toContain('navigate("/home")');
  });
});
