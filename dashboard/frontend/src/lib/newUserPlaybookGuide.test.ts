import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("new user Playbook guide", () => {
  it("uses the durable onboarding status and only activates from Home", () => {
    const home = source("../pages/Home.tsx");
    const layout = source("../components/Layout.tsx");
    expect(home).toContain("getOnboardingStatus(userId)");
    expect(home).toContain("setPlaybookGuideVisible(showPlaybookGuide)");
    expect(home).toContain("첫 파이프라인은 Playbook과 함께 시작해보세요.");
    expect(layout).toContain("<NewUserPlaybookGuide visible={playbookGuideVisible}");
  });

  it("connects the Home callout to the Playbook navigation target", () => {
    expect(source("../pages/Home.tsx")).toContain("data-playbook-guide-origin");
    expect(source("../components/Sidebar.tsx")).toContain("data-playbook-guide-target");
    expect(source("../components/NewUserPlaybookGuide.tsx")).toContain("window.innerWidth < 768");
  });
});
