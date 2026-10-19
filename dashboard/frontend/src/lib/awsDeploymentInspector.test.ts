import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Workspace repository AWS deployment inspector", () => {
  it("shows AWS synced and environment deployment details", () => {
    const source = readFileSync(new URL("../pages/Sessions.tsx", import.meta.url), "utf8");
    expect(source).toContain("AWS Synced");
    expect(source).toContain("p.aws_deployments.map");
    expect(source).toContain("deployment.taskDefinition");
    expect(source).toContain("deployment.runningCount");
    expect(source).toContain("deployment.deployedAt");
    expect(source).toContain("deployment.healthState");
    expect(source).toContain("serviceDeployments");
  });

  it("opens repositories first and keeps history as the third tab", () => {
    const source = readFileSync(new URL("../pages/Sessions.tsx", import.meta.url), "utf8");
    expect(source).toMatch(/INSPECTOR_TABS = \[\s*\{ id: "repositories"/);
    expect(source).toMatch(/\{ id: "history"[^\n]+\},\s*\];/);
    expect(source).toContain('useState<TabType>("repositories")');
  });
});
