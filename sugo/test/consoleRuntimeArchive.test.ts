import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { extractConsoleRuntimeArchive, verifySha256 } from "../src/lifecycle/consoleRuntimeArchive.js";

const roots: string[] = [];
function tar(name: string, contents: string): Buffer {
  const body = Buffer.from(contents);
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "ascii");
  header.write("0000000\0", 108, 8, "ascii");
  header.write("0000000\0", 116, 8, "ascii");
  header.write(`${body.length.toString(8).padStart(11, "0")}\0`, 124, 12, "ascii");
  header.fill(32, 148, 156); header[156] = 48;
  header.write("ustar\0", 257, 6, "ascii");
  let sum = 0; for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return gzipSync(Buffer.concat([header, body, Buffer.alloc((512 - body.length % 512) % 512), Buffer.alloc(1024)]));
}

afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("console runtime archive", () => {
  it("SHA-256이 일치하는 바이트만 승인한다", () => {
    const bytes = Buffer.from("runtime");
    expect(verifySha256(bytes, createHash("sha256").update(bytes).digest("hex"))).toBe(true);
    expect(verifySha256(bytes, "0".repeat(64))).toBe(false);
  });

  it("gzip tar를 외부 runtime 디렉터리에 푼다", async () => {
    const root = mkdtempSync(join(tmpdir(), "sugo-runtime-")); roots.push(root);
    await extractConsoleRuntimeArchive(tar("web/index.html", "hello"), root);
    expect(readFileSync(join(root, "web", "index.html"), "utf8")).toBe("hello");
  });

  it("경로 탈출과 심볼릭 링크 엔트리를 거부한다", async () => {
    const root = mkdtempSync(join(tmpdir(), "sugo-runtime-")); roots.push(root);
    await expect(extractConsoleRuntimeArchive(tar("../escaped", "bad"), root)).rejects.toThrow("unsafe");
    expect(existsSync(join(root, "..", "escaped"))).toBe(false);
  });
});
