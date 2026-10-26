import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("local Settings presentation", () => {
  it("hides manual plugin token management and keeps AWS sync status in the header", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Settings.tsx"), "utf8");
    expect(source).toContain("!LOCAL_DEV && <ApiTokensCard />");
    const header = source.slice(source.indexOf("AWS Context</h2>"), source.indexOf("</div>\n    <div className=\"space-y-4 p-5\">"));
    expect(header).toContain("AWS 전체 동기화");
    expect(header.indexOf("AWS 전체 동기화")).toBeLessThan(header.indexOf("연결됨"));
    expect(header).toContain("ContextRefreshStatus");
    expect(source).toContain("꺼져 있었다면 다음에 켜질 때 동기화");
  });

  it("Pinpoint도 접힌 헤더에서 최신 동기화 시각과 동기화 액션을 제공한다", () => {
    const source = readFileSync(join(process.cwd(), "src/pages/Settings.tsx"), "utf8");
    const pinpoint = source.slice(source.indexOf("function PinpointContextCard"), source.indexOf("function ProjectIntegrationsCard"));
    const header = pinpoint.slice(pinpoint.indexOf("Pinpoint APM</h2>"), pinpoint.indexOf("{expanded && <div"));
    expect(header).toContain("ContextRefreshStatus");
    expect(header).toContain("Pinpoint 동기화");
  });
});
