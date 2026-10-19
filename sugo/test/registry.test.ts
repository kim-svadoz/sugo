import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadRegistry, registerProject, unregisterProject } from "../src/harness/registry.js";

let fakeHome: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-registry-home-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
});

describe("registerProject / loadRegistry — tmpdir을 HOME으로 쓰는 실배선 테스트", () => {
  it("새 프로젝트를 등록하면 registry.json에 나타난다", async () => {
    await registerProject({ path: join(fakeHome, "proj-a"), name: "proj-a", registeredAt: "2026-01-01T00:00:00.000Z" });
    const entries = await loadRegistry();
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("proj-a");
  });

  it("같은 경로로 재등록하면 중복 추가되지 않고 갱신된다", async () => {
    const path = join(fakeHome, "proj-b");
    await registerProject({ path, name: "proj-b", registeredAt: "2026-01-01T00:00:00.000Z" });
    await registerProject({ path, name: "proj-b-renamed", registeredAt: "2026-01-02T00:00:00.000Z" });
    const entries = await loadRegistry();
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe("proj-b-renamed");
  });

  it("서로 다른 경로의 동시 등록이 하나도 유실되지 않는다(락 race 검증)", async () => {
    const count = 8;
    const calls = Array.from({ length: count }, (_, i) =>
      registerProject({
        path: join(fakeHome, `concurrent-${i}`),
        name: `concurrent-${i}`,
        registeredAt: new Date().toISOString(),
      }),
    );
    await Promise.all(calls);
    const entries = await loadRegistry();
    expect(entries.length).toBe(count);
    const names = new Set(entries.map((e) => e.name));
    expect(names.size).toBe(count);
  });

  it("등록된 적 없으면 빈 배열을 반환한다", async () => {
    const entries = await loadRegistry();
    expect(entries).toEqual([]);
  });
});

describe("unregisterProject — sugo_delete(레지스트리만 제거)", () => {
  it("등록된 프로젝트를 제거하면 true를 반환하고 목록에서 사라진다", async () => {
    const path = join(fakeHome, "proj-c");
    await registerProject({ path, name: "proj-c", registeredAt: "2026-01-01T00:00:00.000Z" });
    const removed = await unregisterProject(path);
    expect(removed).toBe(true);
    expect(await loadRegistry()).toEqual([]);
  });

  it("등록된 적 없는 경로면 false를 반환하고 아무 것도 안 바뀐다", async () => {
    const removed = await unregisterProject(join(fakeHome, "no-such-project"));
    expect(removed).toBe(false);
  });

  it("여러 프로젝트 중 하나만 제거하고 나머지는 유지한다", async () => {
    await registerProject({ path: join(fakeHome, "keep-a"), name: "keep-a", registeredAt: "2026-01-01T00:00:00.000Z" });
    await registerProject({ path: join(fakeHome, "remove-me"), name: "remove-me", registeredAt: "2026-01-01T00:00:00.000Z" });
    await unregisterProject(join(fakeHome, "remove-me"));
    const entries = await loadRegistry();
    expect(entries.map((e) => e.name)).toEqual(["keep-a"]);
  });
});
