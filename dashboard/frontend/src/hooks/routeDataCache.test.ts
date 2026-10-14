import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("route data cache", () => {
  it("Workspaces와 Schedule 재진입은 캐시를 즉시 그리고 백그라운드 갱신한다", () => {
    const workspaces = readFileSync(new URL("./useWorkspaces.ts", import.meta.url), "utf8");
    const schedule = readFileSync(new URL("./useSchedule.ts", import.meta.url), "utf8");
    expect(workspaces).toContain("workspaceCache.get(userId)");
    expect(workspaces).toContain("setLoading(!cached)");
    expect(schedule).toContain("scheduleCache.get(userId)");
    expect(schedule).toContain("setLoading(!cached)");
  });
});
