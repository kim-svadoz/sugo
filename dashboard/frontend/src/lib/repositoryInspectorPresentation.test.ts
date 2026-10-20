import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("repository inspector presentation", () => {
  it("starts every repository collapsed and reveals AWS details only on request", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Sessions.tsx"), "utf8");

    expect(source).toContain("useState<string | null>(null)");
    expect(source).toContain("aria-expanded={isExpanded}");
    expect(source).toContain("ChevronRight");
    expect(source).toContain('isExpanded && "rotate-90 text-cyan-300"');
    expect(source).toContain("setExpandedRepository(isExpanded ? null : p.project_path)");
    expect(source).toContain('{isExpanded && <div className="border-t border-[var(--color-border)] px-3 pb-3">');
  });
});
