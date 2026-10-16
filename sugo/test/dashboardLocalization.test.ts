import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

describe("Dashboard Korean catalog", () => {
  it("has a Korean display document for every executable skill", () => {
    const names = readdirSync(join(ROOT, "skills"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(ROOT, "skills", entry.name, "SKILL.md")))
      .map((entry) => entry.name);

    for (const name of names) {
      const localized = join(ROOT, "locales", "ko", "skills", name, "SKILL.md");
      expect(existsSync(localized), `missing Korean skill: ${name}`).toBe(true);
      expect(readFileSync(localized, "utf8"), `Korean skill has no Korean text: ${name}`).toMatch(/[가-힣]/);
    }
  });

  it("has a Korean display document for every executable command", () => {
    const names = readdirSync(join(ROOT, "commands"))
      .filter((name) => name.endsWith(".md"));

    for (const name of names) {
      const localized = join(ROOT, "locales", "ko", "commands", name);
      expect(existsSync(localized), `missing Korean command: ${name}`).toBe(true);
      expect(readFileSync(localized, "utf8"), `Korean command has no Korean text: ${name}`).toMatch(/[가-힣]/);
    }
  });
});
