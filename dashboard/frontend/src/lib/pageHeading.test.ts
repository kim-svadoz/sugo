import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("page heading typography", () => {
  it("Schedule 제목이 Workspaces와 같은 크기와 굵기를 사용한다", () => {
    const sessions = readFileSync(new URL("../pages/Sessions.tsx", import.meta.url), "utf8");
    const schedule = readFileSync(new URL("../pages/SchedulePage.tsx", import.meta.url), "utf8");
    expect(sessions).toContain('text-lg font-semibold text-[var(--color-text-bright)]');
    expect(schedule).toContain('text-lg font-semibold text-[var(--color-text-bright)]');
  });
});
