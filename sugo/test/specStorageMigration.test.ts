import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrateLegacySpecStorage, rewriteLocalSpecReferences } from "../src/specStorageMigration.js";

let fakeHome: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-spec-migration-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
});

function legacySpec(date: string, feature: string, version: number, content: string): string {
  const path = join(fakeHome, "dev", "spec", date, feature, `v${version}`, "spec.md");
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  writeFileSync(join(path, "..", "spec.json"), JSON.stringify({ title: feature }));
  return path;
}

describe("legacy SPEC storage migration", () => {
  it("기존 SPEC과 보조 JSON을 사용자 Sugo 데이터 루트로 복사하고 경로 매핑을 반환한다", async () => {
    const source = legacySpec("20260917", "login", 1, "# login");

    const result = await migrateLegacySpecStorage();

    const target = join(fakeHome, ".claude", "sugo", "specs", "20260917", "login", "v1", "spec.md");
    expect(result.migrated).toBe(1);
    expect(result.mappings).toContainEqual({ from: source, to: target });
    expect(readFileSync(target, "utf8")).toBe("# login");
    expect(existsSync(join(target, "..", "spec.json"))).toBe(true);
    expect(existsSync(source)).toBe(true);
  });

  it("같은 버전에 다른 SPEC이 있으면 덮어쓰지 않고 다음 빈 버전으로 이관한다", async () => {
    const source = legacySpec("20260917", "login", 1, "# legacy");
    const occupied = join(fakeHome, ".claude", "sugo", "specs", "20260917", "login", "v1", "spec.md");
    mkdirSync(join(occupied, ".."), { recursive: true });
    writeFileSync(occupied, "# current");

    const result = await migrateLegacySpecStorage();

    const target = join(fakeHome, ".claude", "sugo", "specs", "20260917", "login", "v2", "spec.md");
    expect(result.mappings).toContainEqual({ from: source, to: target });
    expect(readFileSync(occupied, "utf8")).toBe("# current");
    expect(readFileSync(target, "utf8")).toBe("# legacy");
  });

  it("완료 마커가 있으면 재실행해도 SPEC을 중복 생성하지 않는다", async () => {
    legacySpec("20260917", "login", 1, "# login");
    const first = await migrateLegacySpecStorage();
    const second = await migrateLegacySpecStorage();

    expect(first.migrated).toBe(1);
    expect(second.alreadyMigrated).toBe(true);
    expect(second.mappings).toEqual(first.mappings);
    expect(existsSync(join(fakeHome, ".claude", "sugo", "specs", "20260917", "login", "v2"))).toBe(false);
  });

  it("세션·로드맵 JSON의 이전 절대경로를 새 경로로 원자적으로 갱신한다", async () => {
    const source = legacySpec("20260917", "login", 1, "# login");
    const result = await migrateLegacySpecStorage();
    const state = join(fakeHome, ".claude", "sugo", "work", "ws", "roadmap.json");
    mkdirSync(join(state, ".."), { recursive: true });
    writeFileSync(state, JSON.stringify({ specPath: source }));

    await expect(rewriteLocalSpecReferences(result.mappings)).resolves.toBe(1);
    expect(JSON.parse(readFileSync(state, "utf8")).specPath).toBe(result.mappings[0].to);
  });
});
