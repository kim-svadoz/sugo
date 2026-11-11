import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareConsoleRuntime, resolveConsoleRuntime, rollbackConsoleRuntime } from "../src/lifecycle/consoleRuntime.js";

function runtime(root: string, version: string, engineApiVersion = 1) {
  mkdirSync(join(root, "dashboard-runtime", "web"), { recursive: true });
  writeFileSync(join(root, "dashboard-runtime", "server.mjs"), `// ${version}`);
  writeFileSync(join(root, "dashboard-runtime", "runtime.json"), JSON.stringify({ runtimeSchemaVersion: 1, engineApiVersion, consoleVersion: version }));
}

describe("resolveConsoleRuntime", () => {
  it("embedded Console의 경로와 버전을 Plugin 버전과 독립된 build id로 반환한다", () => {
    const root = mkdtempSync(join(tmpdir(), "sugo-console-runtime-"));
    runtime(root, "0.58.18");

    expect(resolveConsoleRuntime(root)).toEqual({
      source: "embedded",
      runtimeRoot: join(root, "dashboard-runtime"),
      entryPath: join(root, "dashboard-runtime", "server.mjs"),
      consoleVersion: "0.58.18",
      buildId: "console-0.58.18",
    });
  });

  it("runtime manifest나 entry가 없으면 null을 반환한다", () => {
    expect(resolveConsoleRuntime(mkdtempSync(join(tmpdir(), "sugo-console-runtime-empty-")))).toBeNull();
  });

  it("embedded runtime을 외부 저장소에 승격하고 이후 외부본을 우선 선택한다", async () => {
    const plugin = mkdtempSync(join(tmpdir(), "sugo-console-plugin-"));
    const home = mkdtempSync(join(tmpdir(), "sugo-console-home-"));
    runtime(plugin, "0.59.0");
    const prepared = await prepareConsoleRuntime(plugin, home);
    expect(prepared?.source).toBe("external");
    expect(resolveConsoleRuntime(plugin, home)).toMatchObject({ source: "external", consoleVersion: "0.59.0" });
  });

  it("여러 세션이 동시에 승격해도 완전한 runtime 하나만 활성화한다", async () => {
    const plugin = mkdtempSync(join(tmpdir(), "sugo-console-race-plugin-"));
    const home = mkdtempSync(join(tmpdir(), "sugo-console-race-home-"));
    runtime(plugin, "0.59.0");
    const prepared = await Promise.all([prepareConsoleRuntime(plugin, home), prepareConsoleRuntime(plugin, home), prepareConsoleRuntime(plugin, home)]);
    expect(prepared.every((item) => item?.source === "external" && item.consoleVersion === "0.59.0")).toBe(true);
    expect(resolveConsoleRuntime(plugin, home)?.source).toBe("external");
  });

  it("호환되지 않는 외부 runtime은 거부하고 embedded 호환본으로 폴백한다", async () => {
    const badPlugin = mkdtempSync(join(tmpdir(), "sugo-console-bad-plugin-"));
    const goodPlugin = mkdtempSync(join(tmpdir(), "sugo-console-good-plugin-"));
    const home = mkdtempSync(join(tmpdir(), "sugo-console-home-"));
    runtime(badPlugin, "9.0.0", 99);
    runtime(goodPlugin, "0.59.0");
    await prepareConsoleRuntime(badPlugin, home);
    expect(resolveConsoleRuntime(goodPlugin, home)).toMatchObject({ source: "embedded", consoleVersion: "0.59.0" });
  });

  it("이전 외부 runtime으로 rollback하면 pinned되어 자동 업데이트가 되돌리지 않는다", async () => {
    const plugin1 = mkdtempSync(join(tmpdir(), "sugo-console-plugin1-"));
    const plugin2 = mkdtempSync(join(tmpdir(), "sugo-console-plugin2-"));
    const home = mkdtempSync(join(tmpdir(), "sugo-console-home-"));
    runtime(plugin1, "0.59.0");
    runtime(plugin2, "0.60.0");
    await prepareConsoleRuntime(plugin1, home);
    await prepareConsoleRuntime(plugin2, home);
    const rolledBack = await rollbackConsoleRuntime(home);
    expect(rolledBack).toMatchObject({ source: "external", consoleVersion: "0.59.0" });
    expect((await prepareConsoleRuntime(plugin2, home))?.consoleVersion).toBe("0.59.0");
  });
});
