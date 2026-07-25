import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseValidationYaml } from "../src/harness/validationConfig.js";

const libraryDir = join(dirname(fileURLToPath(import.meta.url)), "..", "harness-library");

describe("parseValidationYaml", () => {
  it("실제 lang/typescript validation.yaml을 파싱한다", () => {
    const content = readFileSync(join(libraryDir, "lang", "typescript", "validation.yaml"), "utf-8");
    const parsed = parseValidationYaml(content);
    expect(parsed.harnessId).toBe("lang/typescript");
    expect(parsed.checks.length).toBeGreaterThan(0);
    expect(parsed.checks.every((c) => c.id.length > 0)).toBe(true);
    expect(parsed.checks.some((c) => c.severity === "error")).toBe(true);
  });

  it("checks가 없는 빈 YAML도 안전하게 처리한다", () => {
    const parsed = parseValidationYaml("harnessId: empty\n");
    expect(parsed.harnessId).toBe("empty");
    expect(parsed.checks).toEqual([]);
  });

  it("id 없는 check 항목은 걸러낸다", () => {
    const parsed = parseValidationYaml("harnessId: x\nchecks:\n  - description: \"id 없음\"\n  - id: valid-one\n    description: \"ok\"\n    severity: error\n");
    expect(parsed.checks.length).toBe(1);
    expect(parsed.checks[0].id).toBe("valid-one");
  });
});
