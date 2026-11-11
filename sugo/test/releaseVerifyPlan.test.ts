import { describe, expect, it } from "vitest";
import { releaseVerificationScripts } from "../scripts/releaseVerifyPlan.js";

describe("releaseVerificationScripts", () => {
  it("plugin-only releases run the packaging core without dashboard e2e", () => {
    expect(releaseVerificationScripts("0.68.19", "plugin")).toEqual(["cold-smoke-core.mjs"]);
  });

  it("console runtime releases add dashboard e2e", () => {
    expect(releaseVerificationScripts("0.68.19", "console")).toEqual([
      "cold-smoke-core.mjs",
      "dashboard-e2e.mjs",
    ]);
  });

  it("tenth patches retain the full release contract", () => {
    expect(releaseVerificationScripts("0.68.20", "plugin")).toEqual([
      "cold-smoke-core.mjs",
      "dashboard-e2e.mjs",
      "cold-smoke.mjs",
    ]);
  });
});
