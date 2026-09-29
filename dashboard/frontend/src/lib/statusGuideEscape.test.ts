import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Workspaces status guide keyboard contract", () => {
  it("closes the guide on Escape and removes the listener on cleanup", () => {
    const source = readFileSync(new URL("../pages/Sessions.tsx", import.meta.url), "utf8");
    expect(source).toContain('if (event.key === "Escape" && showStatusGuide)');
    expect(source).toContain('window.addEventListener("keydown", closeGuideOnEscape)');
    expect(source).toContain('window.removeEventListener("keydown", closeGuideOnEscape)');
  });
});
