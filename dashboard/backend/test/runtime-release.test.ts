import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Console runtime release manifest", () => {
  it("현재 Console 버전, 불변 asset URL, SHA-256을 기록한다", () => {
    const root = mkdtempSync(join(tmpdir(), "sugo-release-"));
    const archive = join(root, "console-runtime.tgz"); const output = join(root, "console-runtime.json");
    writeFileSync(archive, "runtime archive");
    execFileSync(process.execPath, [join(process.cwd(), "write-runtime-release.mjs"), archive, output, "owner/repo"]);
    const manifest = JSON.parse(readFileSync(output, "utf8"));
    const version = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")).version;
    expect(manifest).toEqual({
      runtimeSchemaVersion: 1,
      engineApiVersion: 1,
      consoleVersion: version,
      archiveUrl: `https://github.com/owner/repo/releases/download/console-v${version}/console-runtime.tgz`,
      sha256: createHash("sha256").update("runtime archive").digest("hex"),
    });
  });
});
