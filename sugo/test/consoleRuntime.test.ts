import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveConsoleRuntime } from "../src/lifecycle/consoleRuntime.js";

describe("resolveConsoleRuntime", () => {
  it("embedded Console의 경로와 버전을 Plugin 버전과 독립된 build id로 반환한다", () => {
    const root = mkdtempSync(join(tmpdir(), "sugo-console-runtime-"));
    mkdirSync(join(root, "dashboard-runtime", "web"), { recursive: true });
    writeFileSync(join(root, "dashboard-runtime", "server.mjs"), "");
    writeFileSync(join(root, "dashboard-runtime", "runtime.json"), JSON.stringify({ consoleVersion: "0.58.18" }));

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
});
