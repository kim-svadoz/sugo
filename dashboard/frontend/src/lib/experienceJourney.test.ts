import { describe, expect, it } from "vitest";
import { dashboardScene } from "./experienceJourney.js";

describe("dashboard experience journey", () => {
  it("각 핵심 화면을 현재 맥락, 효용, 다음 행동으로 설명한다", () => {
    for (const path of ["/home", "/sessions", "/schedule", "/weekly", "/skills", "/harness", "/playbook"]) {
      const scene = dashboardScene(path);
      expect(scene.context).not.toBe("");
      expect(scene.value).not.toBe("");
      expect(scene.action.label).not.toBe("");
      expect(scene.action.path).toMatch(/^\//);
    }
  });

  it("일정에서 실행 흐름으로, 실행 흐름에서 근거 검토로 자연스럽게 이어진다", () => {
    expect(dashboardScene("/schedule").action.path).toBe("/sessions");
    expect(dashboardScene("/sessions").action.path).toBe("/weekly");
  });

  it("하위 경로도 상위 제품 장면을 유지한다", () => {
    expect(dashboardScene("/roadmap/sample-workspace").id).toBe("workspaces");
  });
});
