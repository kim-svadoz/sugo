import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sessions = readFileSync(new URL("../pages/Sessions.tsx", import.meta.url), "utf8");
const harness = readFileSync(new URL("../pages/Harness.tsx", import.meta.url), "utf8");
const skills = readFileSync(new URL("../pages/Skills.tsx", import.meta.url), "utf8");

describe("주요 운영 화면의 정보 밀도", () => {
  it("도메인 전환과 선택한 작업장을 한 화면에 두고 상세 영역을 같은 높이로 나눈다", () => {
    expect(sessions).toContain("command-brief ck-stage-in group flex w-full shrink-0 items-center justify-between gap-4 rounded-xl border px-3 py-2");
    expect(sessions).toContain('aria-label="도메인 선택"');
    expect(sessions).toContain("xl:grid-cols-[240px_minmax(0,1fr)]");
    expect(sessions).toContain("lg:grid-cols-[minmax(260px,0.78fr)_minmax(440px,1.22fr)]");
    expect(sessions).not.toContain('role="separator" aria-orientation="vertical"');
    expect(sessions).not.toContain("CURRENT_WORKSPACE");
  });

  it("하네스 안내와 실제 규칙 선택을 구분하고 카테고리를 내용 너비로 표시한다", () => {
    expect(harness).toContain('aria-label="규칙 선택"');
    expect(harness).toContain("규칙 선택");
    expect(harness).toContain('className="flex flex-wrap gap-2" role="tablist"');
    expect(harness).not.toContain('className="grid grid-cols-4 gap-2" role="tablist"');
  });

  it("스킬 종류 전환과 설명을 하나의 조작 영역으로 묶고 중복 구분선을 제거한다", () => {
    expect(skills).toContain('aria-label="카탈로그 종류" className="flex flex-wrap items-center gap-3"');
    expect(skills).not.toContain('aria-label="카탈로그 종류" className="border-y border-[var(--color-border)] py-2"');
    expect(skills).not.toContain('className="divide-y divide-[var(--color-border)] border-y border-[var(--color-border)]"');
  });
});
