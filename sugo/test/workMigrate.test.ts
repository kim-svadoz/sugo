import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { legacyHulkRootDir, migrateWorkDataDir, workRootDir } from "../src/work/storage.js";

let fakeHome: string;

function hulkPath(...parts: string[]): string {
  return join(legacyHulkRootDir(), ...parts);
}
function workPath(...parts: string[]): string {
  return join(workRootDir(), ...parts);
}
function write(path: string, text: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, text);
}

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-workmigrate-home-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
});

/**
 * §9 WORK 리네임(`hulk/` → `work/`) 마이그레이션. 사용자의 **누적된 실제 작업 원장**을 옮기는
 * 일이라 안전측이 명확하다: 절대 덮어쓰지 않고(no-clobber), 한 건이라도 실패하면 완료 마커를
 * 남기지 않아 다음 부팅에 다시 시도한다.
 */
describe("§9 migrateWorkDataDir — copy-merge", () => {
  it("구 디렉터리가 없으면 아무 것도 안 하고 마커도 안 남긴다", async () => {
    const r = await migrateWorkDataDir();
    expect(r.migrated).toBe(false);
    expect(r.copied).toBe(0);
    expect(existsSync(join(fakeHome, ".claude", "sugo", "work", ".hulk-migrated"))).toBe(false);
  });

  it("구 데이터를 work/로 복사하고 마커를 남긴다", async () => {
    write(hulkPath("ws1", "tasks.json"), '{"tasks":[]}');
    write(hulkPath("ws1", "checkpoints", "CP-001.md"), "# CP");
    write(hulkPath("sync-retry-queue.json"), '{"items":[]}');

    const r = await migrateWorkDataDir();

    expect(r.migrated).toBe(true);
    expect(r.copied).toBe(3);
    expect(r.failures).toBe(0);
    expect(readFileSync(workPath("ws1", "tasks.json"), "utf8")).toBe('{"tasks":[]}');
    expect(readFileSync(workPath("ws1", "checkpoints", "CP-001.md"), "utf8")).toBe("# CP");
    expect(readFileSync(workPath("sync-retry-queue.json"), "utf8")).toBe('{"items":[]}');
  });

  it("**구 데이터를 지우지 않는다** — 복사이지 이동이 아니다(롤백 가능)", async () => {
    write(hulkPath("ws1", "tasks.json"), "original");
    await migrateWorkDataDir();
    expect(readFileSync(hulkPath("ws1", "tasks.json"), "utf8")).toBe("original");
  });

  it("no-clobber: work/에 이미 있는 파일은 건드리지 않는다", async () => {
    write(hulkPath("ws1", "tasks.json"), "old");
    write(workPath("ws1", "tasks.json"), "new");

    const r = await migrateWorkDataDir();

    expect(readFileSync(workPath("ws1", "tasks.json"), "utf8")).toBe("new");
    expect(r.skipped).toBe(1);
    expect(r.copied).toBe(0);
  });

  it("copy-merge: 겹치지 않는 파일만 채워 넣는다", async () => {
    write(hulkPath("ws1", "tasks.json"), "old-tasks");
    write(hulkPath("ws1", "memory.md"), "old-memory");
    write(workPath("ws1", "tasks.json"), "new-tasks");

    const r = await migrateWorkDataDir();

    expect(readFileSync(workPath("ws1", "tasks.json"), "utf8")).toBe("new-tasks");
    expect(readFileSync(workPath("ws1", "memory.md"), "utf8")).toBe("old-memory");
    expect(r.copied).toBe(1);
    expect(r.skipped).toBe(1);
  });

  it("마커가 있으면 두 번째 호출은 즉시 no-op(재스캔 안 함)", async () => {
    write(hulkPath("ws1", "tasks.json"), "a");
    const first = await migrateWorkDataDir();
    expect(first.migrated).toBe(true);

    // 마커 이후 구 디렉터리에 새 파일이 생겨도 다시 긁어오지 않는다 —
    // 마이그레이션은 1회성이고, 이후 구 경로에 쓰는 건 그냥 낡은 클라이언트다.
    write(hulkPath("ws1", "late.json"), "b");
    const second = await migrateWorkDataDir();
    expect(second.migrated).toBe(false);
    expect(second.alreadyMigrated).toBe(true);
    expect(existsSync(workPath("ws1", "late.json"))).toBe(false);
  });

  it("멱등: 마커를 지우고 다시 돌려도 결과가 같다(전부 skip)", async () => {
    write(hulkPath("ws1", "tasks.json"), "a");
    await migrateWorkDataDir();
    rmSync(workPath(".hulk-migrated"));

    const again = await migrateWorkDataDir();
    expect(again.copied).toBe(0);
    expect(again.skipped).toBe(1);
    expect(readFileSync(workPath("ws1", "tasks.json"), "utf8")).toBe("a");
  });

  it("빈 구 디렉터리도 마커를 남긴다(다음 부팅에 재스캔 안 하도록)", async () => {
    mkdirSync(legacyHulkRootDir(), { recursive: true });
    const r = await migrateWorkDataDir();
    expect(r.migrated).toBe(true);
    expect(r.copied).toBe(0);
    expect(existsSync(workPath(".hulk-migrated"))).toBe(true);
  });

  it("마커 내용에 복사 통계가 남아 사후 감사 가능하다", async () => {
    write(hulkPath("ws1", "tasks.json"), "a");
    await migrateWorkDataDir();
    const marker = JSON.parse(readFileSync(workPath(".hulk-migrated"), "utf8"));
    expect(marker.copied).toBe(1);
    expect(marker.failures).toBe(0);
    expect(typeof marker.migratedAt).toBe("string");
  });
});
