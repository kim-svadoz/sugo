import { describe, expect, it } from "vitest";
import {
  buildVerificationPlan,
  classifyChangeImpact,
  isBroadVerificationCommand,
} from "../src/verificationPlan.js";

describe("verification plan", () => {
  it("isolated frontend logic stays targeted and does not pull backend or release checks into implementation", () => {
    const impact = classifyChangeImpact(["dashboard/frontend/src/lib/report.ts"]);
    const plan = buildVerificationPlan(impact, "bugfix");

    expect(impact.products).toEqual(["console"]);
    expect(impact.areas).toEqual(["console-frontend"]);
    expect(plan.level).toBe("targeted");
    expect(plan.implementationChecks).toEqual(["targeted-test", "frontend-build"]);
    expect(plan.implementationChecks).not.toContain("backend-test");
    expect(plan.releaseChecks).toEqual(["console-version", "external-runtime-promotion", "dashboard-e2e"]);
  });

  it("gate, persistence, authentication, packaging, and coupled changes require full verification", () => {
    for (const file of [
      "sugo/src/gates.ts",
      "dashboard/backend/src/db/schema.ts",
      "dashboard/backend/src/auth/session.ts",
      "sugo/build.mjs",
    ]) {
      expect(buildVerificationPlan(classifyChangeImpact([file]), "feature").level).toBe("full");
    }
    expect(buildVerificationPlan(classifyChangeImpact([
      "dashboard/frontend/src/App.tsx",
      "dashboard/backend/src/index.ts",
    ]), "feature").level).toBe("full");
  });

  it("test and documentation changes do not request product releases", () => {
    const plan = buildVerificationPlan(classifyChangeImpact([
      "sugo/test/chain.test.ts",
      "docs/verification.md",
    ]), "refactor");

    expect(plan.releaseChecks).toEqual([]);
  });

  it("recognizes broad commands across supported build tools", () => {
    expect(isBroadVerificationCommand("npm test")).toBe(true);
    expect(isBroadVerificationCommand("npx vitest run src/foo.test.ts")).toBe(false);
    expect(isBroadVerificationCommand("./gradlew check")).toBe(true);
    expect(isBroadVerificationCommand("./gradlew test --tests '*FooTest'")).toBe(false);
    expect(isBroadVerificationCommand("mvn verify")).toBe(true);
    expect(isBroadVerificationCommand("pytest tests/test_login.py")).toBe(false);
    expect(isBroadVerificationCommand("pytest")).toBe(true);
  });
});
