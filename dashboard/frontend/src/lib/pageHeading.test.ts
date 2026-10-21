import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("page heading typography", () => {
  it("주요 탭은 영문 보조 헤더와 한글 주 헤더의 공통 컴포넌트를 사용한다", () => {
    for (const page of ["Sessions", "SchedulePage", "WeeklyPage", "Skills", "Playbook", "Harness", "Settings", "Preferences"]) {
      const source = readFileSync(new URL(`../pages/${page}.tsx`, import.meta.url), "utf8");
      expect(source, page).toContain("PageHeading");
    }
  });

  it("Home에서 연 SPEC 상세는 닫을 때 Home으로 돌아간다", () => {
    const home = readFileSync(new URL("../pages/Home.tsx", import.meta.url), "utf8");
    const schedule = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(home).toContain("returnTo=home");
    expect(schedule).toContain('searchParams.get("returnTo")');
    expect(schedule).toContain('navigate("/home")');
  });
});
