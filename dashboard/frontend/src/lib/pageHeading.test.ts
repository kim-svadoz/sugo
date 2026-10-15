import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("page heading typography", () => {
  it("Schedule 제목이 Domains와 같은 크기와 굵기를 사용한다", () => {
    const sessions = readFileSync(new URL("../pages/Sessions.tsx", import.meta.url), "utf8");
    const schedule = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(sessions).toContain('text-lg font-semibold text-[var(--color-text-bright)]');
    expect(schedule).toContain('text-lg font-semibold text-[var(--color-text-bright)]');
    expect(schedule).not.toContain('title="현재 열려 있는 일정 수"');
    expect(schedule).not.toContain("OperationalPulse");
    expect(schedule).not.toContain("여러 워크스페이스의 Spec 마감일을 한 곳에서 확인합니다.");
  });
});
