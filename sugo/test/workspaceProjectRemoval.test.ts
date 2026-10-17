import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { registerProject } from "../src/harness/registry.js";
import { deleteWorkspace, ensureWorkspace, loadWorkspace, removeProjectFromWorkspaces } from "../src/work/workspace.js";
import { handleSugoDelete } from "../src/tools/sugoDelete.js";

let fakeHome: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-ws-removal-home-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
});

describe("removeProjectFromWorkspaces — tmpdir을 HOME으로 쓰는 실배선 테스트", () => {
  it("소속 워크스페이스에서 해당 프로젝트만 빼고 나머지는 남긴다", async () => {
    const keep = join(fakeHome, "keep");
    const drop = join(fakeHome, "drop");
    await ensureWorkspace("ws", keep);
    await ensureWorkspace("ws", drop);

    const affected = await removeProjectFromWorkspaces(drop);

    expect(affected).toEqual(["ws"]);
    expect((await loadWorkspace("ws"))?.projects).toEqual([keep]);
  });

  it("여러 워크스페이스에 걸쳐 있으면 전부에서 뺀다", async () => {
    const shared = join(fakeHome, "shared");
    await ensureWorkspace("ws-a", shared);
    await ensureWorkspace("ws-b", shared);

    const affected = await removeProjectFromWorkspaces(shared);

    expect(affected.sort()).toEqual(["ws-a", "ws-b"]);
    expect((await loadWorkspace("ws-a"))?.projects).toEqual([]);
    expect((await loadWorkspace("ws-b"))?.projects).toEqual([]);
  });

  it("어디에도 속하지 않으면 아무것도 바꾸지 않고 빈 배열을 돌려준다", async () => {
    const other = join(fakeHome, "other");
    await ensureWorkspace("ws", other);

    const affected = await removeProjectFromWorkspaces(join(fakeHome, "never-added"));

    expect(affected).toEqual([]);
    expect((await loadWorkspace("ws"))?.projects).toEqual([other]);
  });

  it("soft delete된 워크스페이스에 남은 고아도 제거한다", async () => {
    // 숨겨졌을 뿐 ensureWorkspace로 되살릴 수 있는 데이터라, 여기 남으면 복구 시 되살아난다.
    const path = join(fakeHome, "proj");
    await ensureWorkspace("hidden", path);
    await deleteWorkspace("hidden");

    const affected = await removeProjectFromWorkspaces(path);

    expect(affected).toEqual(["hidden"]);
    const ws = await loadWorkspace("hidden");
    expect(ws?.projects).toEqual([]);
    expect(ws?.deleted_at).toBeTruthy(); // 삭제 표시는 건드리지 않는다
  });
});

describe("sugo_delete — 등록 해제가 워크스페이스 멤버십까지 푼다", () => {
  it("레지스트리와 워크스페이스 양쪽에서 빠진다", async () => {
    const path = join(fakeHome, "proj");
    await registerProject({ path, name: "proj", registeredAt: "2026-01-01T00:00:00.000Z" });
    await ensureWorkspace("ws", path);

    const result = await handleSugoDelete({ projectPath: path });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.ok).toBe(true);
    expect(payload.removedFromRegistry).toBe(true);
    expect(payload.removedFromWorkspaces).toEqual(["ws"]);
    expect((await loadWorkspace("ws"))?.projects).toEqual([]);
  });

  it("등록되지 않은 프로젝트면 워크스페이스를 건드리지 않는다", async () => {
    const path = join(fakeHome, "unregistered");
    await ensureWorkspace("ws", path); // 워크스페이스에만 있고 레지스트리엔 없는 상태

    const result = await handleSugoDelete({ projectPath: path });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.ok).toBe(false);
    expect(payload.errorCode).toBe("PROJECT_NOT_REGISTERED");
    expect((await loadWorkspace("ws"))?.projects).toEqual([path]);
  });
});
