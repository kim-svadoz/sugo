import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("responsive dashboard shell", () => {
  it("lets the shared shell use the available height and tighter laptop padding", () => {
    const layout = source("../components/Layout.tsx");
    expect(layout).toContain("h-full min-h-0");
    expect(layout).toContain("p-3 lg:p-5 2xl:p-6");
    expect(layout).not.toContain("h-[calc(100vh/1.1)]");
  });

  it("uses hoverable square calendar markers on laptop-width screens", () => {
    const schedule = source("../pages/SchedulePage.tsx");
    expect(schedule).toContain("max-[1900px]:hidden");
    expect(schedule).toContain('aria-label={`개발 일정 · ${commitment.title}`}');
    expect(schedule).toContain('aria-label={`메모 · ${memo.title}`}');
    expect(schedule).toContain("group-hover/marker:opacity-100");
    expect(schedule).toContain("rounded-[3px]");
    expect(schedule).toContain("whitespace-nowrap break-keep");
    expect(schedule).toContain("backgroundColor: colorOf(commitment.workspace_name)");
    expect(schedule).not.toContain("backgroundColor: getWorkspaceColor(commitment.workspace_name, 0)");
    expect(schedule).toContain("일정 미리보기");
    expect(schedule).not.toContain("calendarPreviewSummary(spec)");
    expect(schedule).not.toContain("nextAction.label");
    expect(schedule).toContain('min-[1901px]:grid-cols-[220px_1fr]');
    expect(schedule).toContain("max-[1900px]:max-h-44");
  });

  it("keeps workspace cards and their actions inside the viewport", () => {
    const sessions = source("../pages/Sessions.tsx");
    expect(sessions).toContain('className="flex min-h-full flex-col gap-3 2xl:gap-4"');
    expect(sessions).toContain("xl:grid-cols-3");
    expect(sessions).toContain("workspace-card-grid");
    expect(sessions).toContain("flex flex-nowrap items-center gap-2");
    expect(sessions).toContain('className="workspace-card-grid grid shrink-0 grid-cols-1 gap-2.5 md:grid-cols-2');
    expect(sessions).not.toContain("h-[calc(100vh-7rem)] min-h-[640px]");
  });

  it("keeps harness navigation aligned and compact on laptop screens", () => {
    const harness = source("../pages/Harness.tsx");
    expect(harness).toContain('className="grid grid-cols-4 gap-2"');
    expect(harness).toContain("max-[1900px]:grid-cols-[280px_minmax(0,1fr)]");
    expect(harness).toContain("max-[1900px]:text-[11px]");
    expect(harness).toContain("whitespace-nowrap");
    expect(harness).not.toContain("min-h-[calc(100vh-210px)]");
    expect(harness).not.toContain("2xl:min-h-24");
  });

  it("reduces heading density when the viewport is short", () => {
    const css = source("../index.css");
    expect(css).toContain("@media (max-height: 900px)");
    expect(css).toContain(".page-heading");
    expect(css).toContain("@media (min-width: 2100px)");
  });

  it("uses the concise engineering feed description", () => {
    const home = source("../pages/Home.tsx");
    expect(home).toContain("기술 블로그 모음");
    expect(home).not.toContain("기술 조직이 직접 공유한 새 글 · 매일 오전 8시 갱신");
  });
});
