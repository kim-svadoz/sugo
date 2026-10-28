import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("new user Playbook guide", () => {
  it("uses the durable onboarding status and only activates from Home", () => {
    const home = source("../pages/Home.tsx");
    const layout = source("../components/Layout.tsx");
    expect(home).toContain("getOnboardingStatus(userId)");
    expect(home).toContain("setPlaybookGuideVisible(showPlaybookGuide)");
    expect(home).toContain('data-onboarding-tour-target={showPlaybookGuide ? "home"');
    expect(home).toContain('data-onboarding-tour-target={showPlaybookGuide ? "pipeline"');
    expect(layout).toContain("<NewUserPlaybookGuide visible={playbookGuideVisible}");
  });

  it("walks through the product landmarks and ends at project registration", () => {
    const sidebar = source("../components/Sidebar.tsx");
    const guide = source("../components/NewUserPlaybookGuide.tsx");
    expect(sidebar).toContain('to === "/playbook" ? "playbook"');
    expect(sidebar).toContain('to === "/sessions" ? "workspaces"');
    expect(guide).toContain('key: "home"');
    expect(guide).toContain('key: "pipeline"');
    expect(guide).toContain('navigate("/settings?section=projects&register=1")');
    expect(guide).toContain("sugo.onboarding.tour.dismissed");
  });

  it("keeps the future team gate hidden unless its feature flag is enabled", () => {
    const login = source("../pages/Login.tsx");
    expect(login).toContain('VITE_TEAM_WORKSPACES === "true"');
    expect(login).toContain("teamWorkspacesEnabled &&");
    expect(login).toContain("개인 작업 공간");
    expect(login).toContain("조직 작업 공간");
  });
});
