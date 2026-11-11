import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadConsoleRuntime, fetchConsoleRuntimeRelease, prepareConsoleRuntime, resolveConsoleRuntime, rollbackConsoleRuntime } from "../src/lifecycle/consoleRuntime.js";

beforeEach(() => vi.stubEnv("SUGO_CONSOLE_RUNTIME_MANIFEST_URL", "http://127.0.0.1:1/unavailable"));

function archive(files: Record<string, string>): Buffer {
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(files)) {
    const body = Buffer.from(value); const header = Buffer.alloc(512);
    header.write(name); header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12); header.fill(32, 148, 156); header[156] = 48; header.write("ustar\0", 257);
    let sum = 0; for (const byte of header) sum += byte; header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8);
    chunks.push(header, body, Buffer.alloc((512 - body.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
}

function runtime(root: string, version: string, engineApiVersion = 1) {
  mkdirSync(join(root, "dashboard-runtime", "web"), { recursive: true });
  writeFileSync(join(root, "dashboard-runtime", "server.mjs"), `// ${version}`);
  writeFileSync(join(root, "dashboard-runtime", "runtime.json"), JSON.stringify({ runtimeSchemaVersion: 1, engineApiVersion, consoleVersion: version }));
}

describe("resolveConsoleRuntime", () => {
  it("내장본 없이 release manifest와 SHA-256을 검증해 외부 runtime을 설치한다", async () => {
    const home = mkdtempSync(join(tmpdir(), "sugo-console-download-home-"));
    const bytes = archive({
      "server.mjs": "// downloaded",
      "runtime.json": JSON.stringify({ runtimeSchemaVersion: 1, engineApiVersion: 1, consoleVersion: "0.61.0" }),
      "web/index.html": "console",
    });
    const server = createServer((request, response) => {
      if (request.url === "/manifest") response.end(JSON.stringify({ runtimeSchemaVersion: 1, engineApiVersion: 1, consoleVersion: "0.61.0", archiveUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/runtime.tgz`, sha256: createHash("sha256").update(bytes).digest("hex") }));
      else { response.setHeader("content-type", "application/gzip"); response.end(bytes); }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    try {
      const release = await fetchConsoleRuntimeRelease(`http://127.0.0.1:${port}/manifest`);
      expect(release).not.toBeNull();
      expect(await downloadConsoleRuntime(release!, home)).toMatchObject({ source: "external", consoleVersion: "0.61.0" });
      expect(resolveConsoleRuntime("/plugin-without-runtime", home)).toMatchObject({ source: "external", consoleVersion: "0.61.0" });
    } finally { server.close(); }
  });

  it("checksum이 다르면 다운로드를 활성화하지 않는다", async () => {
    const home = mkdtempSync(join(tmpdir(), "sugo-console-checksum-home-"));
    const server = createServer((_request, response) => response.end("corrupt"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    try {
      expect(await downloadConsoleRuntime({ runtimeSchemaVersion: 1, engineApiVersion: 1, consoleVersion: "0.61.0", archiveUrl: `http://127.0.0.1:${port}/runtime.tgz`, sha256: "0".repeat(64) }, home)).toBeNull();
      expect(resolveConsoleRuntime("/plugin-without-runtime", home)).toBeNull();
    } finally { server.close(); }
  });

  it("설치본이 있으면 6시간 동안 원격 확인을 반복하지 않는다", async () => {
    const plugin = mkdtempSync(join(tmpdir(), "sugo-console-cache-plugin-"));
    const home = mkdtempSync(join(tmpdir(), "sugo-console-cache-home-"));
    runtime(plugin, "0.59.0");
    await prepareConsoleRuntime(plugin, home);
    writeFileSync(join(home, ".sugo", "runtime", "console", "update-check.json"), JSON.stringify({ checkedAt: Date.now() }));
    vi.stubEnv("SUGO_CONSOLE_RUNTIME_MANIFEST_URL", "not-a-valid-url");
    expect((await prepareConsoleRuntime("/plugin-without-runtime", home))?.consoleVersion).toBe("0.59.0");
    expect(JSON.parse(readFileSync(join(home, ".sugo", "runtime", "console", "active.json"), "utf8")).version).toBe("0.59.0");
  });
  it("embedded Console의 경로와 버전을 Plugin 버전과 독립된 build id로 반환한다", () => {
    const root = mkdtempSync(join(tmpdir(), "sugo-console-runtime-"));
    const home = mkdtempSync(join(tmpdir(), "sugo-console-runtime-home-"));
    runtime(root, "0.58.18");

    expect(resolveConsoleRuntime(root, home)).toEqual({
      source: "embedded",
      runtimeRoot: join(root, "dashboard-runtime"),
      entryPath: join(root, "dashboard-runtime", "server.mjs"),
      consoleVersion: "0.58.18",
      buildId: "console-0.58.18",
    });
  });

  it("runtime manifest나 entry가 없으면 null을 반환한다", () => {
    expect(resolveConsoleRuntime(
      mkdtempSync(join(tmpdir(), "sugo-console-runtime-empty-")),
      mkdtempSync(join(tmpdir(), "sugo-console-runtime-empty-home-")),
    )).toBeNull();
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
