import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { gunzipSync } from "node:zlib";

export interface ConsoleRuntimeRelease {
  runtimeSchemaVersion: number;
  engineApiVersion: number;
  consoleVersion: string;
  archiveUrl: string;
  sha256: string;
}

export function verifySha256(bytes: Uint8Array, expected: string): boolean {
  return /^[a-f0-9]{64}$/i.test(expected)
    && createHash("sha256").update(bytes).digest("hex") === expected.toLowerCase();
}

function tarString(block: Buffer, start: number, length: number): string {
  const end = block.indexOf(0, start);
  return block.subarray(start, end < 0 || end > start + length ? start + length : end).toString("utf8");
}

function safeTarget(root: string, name: string): string {
  const clean = normalize(name.replaceAll("\\", "/")).replace(/^([/\\])+/, "");
  const target = join(root, clean);
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error(`unsafe runtime archive path: ${name}`);
  return target;
}

export async function extractConsoleRuntimeArchive(archive: Uint8Array, targetRoot: string): Promise<void> {
  const tar = gunzipSync(archive, { maxOutputLength: 256 * 1024 * 1024 });
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const name = tarString(header, 0, 100);
    const prefix = tarString(header, 345, 155);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const sizeText = tarString(header, 124, 12).trim().replace(/\0/g, "");
    const size = Number.parseInt(sizeText || "0", 8);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error("invalid runtime archive size");
    const type = String.fromCharCode(header[156] || 48);
    const target = safeTarget(targetRoot, fullName);
    if (type === "x" || type === "g") {
      // POSIX pax 메타데이터. 실제 파일 엔트리는 바로 다음 블록에 있으며 runtime 경로는 짧게 유지한다.
    } else if (type === "5") await mkdir(target, { recursive: true });
    else if (type === "0" || type === "\0") {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, tar.subarray(offset + 512, offset + 512 + size));
    } else {
      throw new Error(`unsupported runtime archive entry: ${type}`);
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
}
