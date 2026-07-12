import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { atomicWriteFile, withFileLock } from "../src/fsUtil.js";

let dirs: string[] = [];
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "sugo-fsutil-"));
  dirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

describe("atomicWriteFile", () => {
  it("파일을 정확히 쓰고 임시파일을 남기지 않는다", async () => {
    const dir = tmp();
    const target = join(dir, "out.json");
    await atomicWriteFile(target, '{"a":1}');
    expect(readFileSync(target, "utf-8")).toBe('{"a":1}');
    const remaining = readdirSync(dir);
    expect(remaining).toEqual(["out.json"]);
  });

  it("기존 파일을 덮어쓴다", async () => {
    const dir = tmp();
    const target = join(dir, "out.json");
    await atomicWriteFile(target, "v1");
    await atomicWriteFile(target, "v2");
    expect(readFileSync(target, "utf-8")).toBe("v2");
    expect(readdirSync(dir)).toEqual(["out.json"]);
  });
});

describe("withFileLock", () => {
  it("동시 접근을 직렬화한다(겹치지 않는다)", async () => {
    const dir = tmp();
    const lockPath = join(dir, "test.lock");
    const events: string[] = [];

    const taskA = withFileLock(lockPath, async () => {
      events.push("A-start");
      await new Promise((r) => setTimeout(r, 60));
      events.push("A-end");
    });
    const taskB = withFileLock(lockPath, async () => {
      events.push("B-start");
      await new Promise((r) => setTimeout(r, 10));
      events.push("B-end");
    });

    await Promise.all([taskA, taskB]);

    const aStart = events.indexOf("A-start");
    const aEnd = events.indexOf("A-end");
    const bStart = events.indexOf("B-start");
    const bEnd = events.indexOf("B-end");
    const serialized = aEnd < bStart || bEnd < aStart;
    expect(serialized).toBe(true);
    expect(events.length).toBe(4);
  });

  it("실행 후 락 파일이 해제된다", async () => {
    const dir = tmp();
    const lockPath = join(dir, "test.lock");
    await withFileLock(lockPath, async () => {});
    // 다시 즉시 획득 가능해야 함(락이 남아있으면 재시도 끝에 실패했을 것)
    await expect(withFileLock(lockPath, async () => "ok")).resolves.toBe("ok");
  });

  it("fn이 예외를 던져도 락은 해제된다", async () => {
    const dir = tmp();
    const lockPath = join(dir, "test.lock");
    await expect(
      withFileLock(lockPath, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    await expect(withFileLock(lockPath, async () => "ok")).resolves.toBe("ok");
  });
});
