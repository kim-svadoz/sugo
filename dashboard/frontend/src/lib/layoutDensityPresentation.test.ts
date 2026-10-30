import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sessions = readFileSync(new URL("../pages/Sessions.tsx", import.meta.url), "utf8");
const harness = readFileSync(new URL("../pages/Harness.tsx", import.meta.url), "utf8");
const skills = readFileSync(new URL("../pages/Skills.tsx", import.meta.url), "utf8");

describe("주요 운영 화면의 정보 밀도", () => {
  it("도메인 요약과 카드는 작게 유지하고 작업 상세 영역은 더 크게 확보한다", () => {
    expect(sessions).toContain("command-brief ck-stage-in group flex w-full shrink-0 items-center justify-between gap-4 rounded-xl border px-3 py-2");
    expect(sessions).toContain("workspace-control-card group flex min-h-[190px] cursor-pointer flex-col overflow-hidden rounded-xl");
    expect(sessions).toContain("command-detail ck-stage-in flex min-h-[340px]");
    // 최근 작업 요약과 Inspector는 같은 폭 값을 나눠 쓰고, 사이 핸들로 폭을 조절한다.
    expect(sessions).toContain('role="separator" aria-orientation="vertical"');
    expect(sessions.match(/lg:w-\[var\(--summary-w\)\]/g)?.length).toBe(2);
    // 쉬는 작업장은 최근 작업 요약 위로 옮겨 왼쪽 열 하나로 잇는다.
    expect(sessions).toContain("onIdleChange={setFloorIdle}");
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
