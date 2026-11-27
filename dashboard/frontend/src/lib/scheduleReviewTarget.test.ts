import { describe, expect, it } from "vitest";
import { findScheduleReviewTarget, scheduleSpecPath } from "./scheduleReviewTarget.js";

it("워크스페이스와 카드 ID를 각각 인코딩하고 홈 복귀 경로를 유지한다", () => {
  const url = new URL(scheduleSpecPath("R&D 팀", "spec#2", "home"), "http://localhost");
  expect(url.pathname).toBe("/schedule");
  expect(Object.fromEntries(url.searchParams)).toEqual({ reviewWorkspace: "R&D 팀", reviewSpec: "spec#2", returnTo: "home" });
});

describe("findScheduleReviewTarget", () => {
  const specs = [
    { id: "spec-a", workspace_name: "workspace-a" },
    { id: "spec-c", workspace_name: "workspace-b" },
    { id: "spec-b", workspace_name: "workspace-b" },
    { id: "spec-b", workspace_name: "workspace-a" },
  ];

  it("같은 워크스페이스 안에서도 전달받은 SPEC id를 정확히 연다", () => {
    expect(findScheduleReviewTarget(specs, "workspace-a", "spec-b")).toEqual({ id: "spec-b", workspace_name: "workspace-a" });
  });

  it("워크스페이스만 지정하면 일정 카드 상세를 열지 않는다", () => {
    expect(findScheduleReviewTarget(specs, "workspace-a", null)).toBeUndefined();
  });

  it("지정된 카드가 없거나 다른 워크스페이스에 있으면 다른 카드를 열지 않는다", () => {
    for (const id of ["missing", "spec-c"]) {
      expect(findScheduleReviewTarget(specs, "workspace-a", id)).toBeUndefined();
    }
  });
});
