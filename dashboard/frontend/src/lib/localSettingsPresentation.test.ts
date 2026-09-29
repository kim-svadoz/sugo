import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("local Settings presentation", () => {
  it("hides manual plugin token management in local mode and keeps AWS sync in the header", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Settings.tsx"), "utf8");
    expect(source).toContain("!LOCAL_DEV && <ApiTokensCard />");
    const header = source.slice(source.indexOf("AWS Context</h2>"), source.indexOf("</div>\n    <div className=\"space-y-4 p-5\">"));
    expect(header).toContain("AWS 전체 동기화");
    expect(header.indexOf("AWS 전체 동기화")).toBeLessThan(header.indexOf("연결됨"));
  });
});
