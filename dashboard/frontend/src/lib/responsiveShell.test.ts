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

  it("uses compact calendar markers on laptop-width screens", () => {
    const schedule = source("../pages/SchedulePage.tsx");
    expect(schedule).toContain("max-[1500px]:hidden");
    expect(schedule).toContain("hidden max-[1500px]:flex");
    expect(schedule).toContain("whitespace-nowrap break-keep");
  });

  it("keeps workspace cards and their actions inside the viewport", () => {
    const sessions = source("../pages/Sessions.tsx");
    expect(sessions).toContain('className="flex h-full min-h-0 flex-col gap-4"');
    expect(sessions).toContain("min-[1350px]:grid-cols-3");
    expect(sessions).toContain("grid-cols-2");
    expect(sessions).not.toContain("h-[calc(100vh-7rem)] min-h-[640px]");
  });

  it("collapses the harness before its columns become oversized", () => {
    const harness = source("../pages/Harness.tsx");
    expect(harness).toContain("max-[1500px]:grid-cols-1");
    expect(harness).not.toContain("min-h-[calc(100vh-210px)]");
    expect(harness).toContain("2xl:min-h-24");
  });

  it("uses the concise engineering feed description", () => {
    const home = source("../pages/Home.tsx");
    expect(home).toContain("기술 블로그 모음");
    expect(home).not.toContain("기술 조직이 직접 공유한 새 글 · 매일 오전 8시 갱신");
  });
});
