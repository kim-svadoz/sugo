import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteWorkspace, ensureWorkspace, listWorkspaces, loadWorkspace } from "../src/work/workspace.js";
import { workspaceDir } from "../src/work/storage.js";

let fakeHome: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-softdelete-home-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
});

/**
 * 워크스페이스 soft delete. "삭제"가 곧 **데이터 소멸**이면 실수 한 번으로 누적된 태스크·이력·
 * 체크포인트가 사라진다. 기본은 숨김(deleted_at)이고, 진짜 지우는 건 purge를 명시해야만 한다.
 */
describe("deleteWorkspace — 기본 soft", () => {
  it("기본 삭제는 deleted_at만 찍고 데이터를 남긴다", async () => {
    await ensureWorkspace("ws1", "/tmp/p");
    const r = await deleteWorkspace("ws1");

    expect(r.ok).toBe(true);
    expect(r.mode).toBe("soft");
    const ws = await loadWorkspace("ws1");
    expect(ws?.deleted_at).toBeTruthy();
    expect(existsSync(workspaceDir("ws1"))).toBe(true);
  });

  it("listWorkspaces는 기본적으로 삭제된 것을 숨긴다", async () => {
    await ensureWorkspace("ws1");
    await ensureWorkspace("ws2");
    await deleteWorkspace("ws1");

    expect((await listWorkspaces()).map((w) => w.name)).toEqual(["ws2"]);
    expect((await listWorkspaces(true)).map((w) => w.name).sort()).toEqual(["ws1", "ws2"]);
  });

  it("이미 삭제된 워크스페이스를 다시 삭제하면 no-op(타임스탬프 안 덮음)", async () => {
    await ensureWorkspace("ws1");
    await deleteWorkspace("ws1");
    const first = (await loadWorkspace("ws1"))!.deleted_at;

    const r = await deleteWorkspace("ws1");
    expect(r.ok).toBe(true);
    expect(r.alreadyDeleted).toBe(true);
    expect((await loadWorkspace("ws1"))!.deleted_at).toBe(first);
  });

  it("연결된 프로젝트가 있으면 force 없이는 차단한다", async () => {
    await ensureWorkspace("ws1", "/tmp/p");
    const r = await deleteWorkspace("ws1");
    // 프로젝트가 있어도 soft는 데이터를 안 지우므로 통과시킨다 — 차단 대상은 하드 삭제다.
    expect(r.ok).toBe(true);

    await ensureWorkspace("ws2", "/tmp/q");
    const hard = await deleteWorkspace("ws2", { purge: true });
    expect(hard.ok).toBe(false);
    expect(hard.errorCode).toBe("WORKSPACE_HAS_PROJECTS");
    expect(existsSync(workspaceDir("ws2"))).toBe(true);
  });

  it("존재하지 않는 워크스페이스는 not-found", async () => {
    const r = await deleteWorkspace("nope");
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("WORKSPACE_NOT_FOUND");
  });
});

describe("deleteWorkspace — purge(하드)", () => {
  it("purge는 디렉터리를 실제로 지운다", async () => {
    await ensureWorkspace("ws1");
    writeFileSync(join(workspaceDir("ws1"), "tasks.json"), "{}");

    const r = await deleteWorkspace("ws1", { purge: true });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe("purge");
    expect(existsSync(workspaceDir("ws1"))).toBe(false);
    expect(await loadWorkspace("ws1")).toBeNull();
  });

  it("purge + keepData는 레지스트리에서만 빼고 파일은 남긴다", async () => {
    await ensureWorkspace("ws1");
    const r = await deleteWorkspace("ws1", { purge: true, keepData: true });
    expect(r.ok).toBe(true);
    expect(r.dataRemoved).toBe(false);
    expect(existsSync(workspaceDir("ws1"))).toBe(true);
  });

  it("연결 프로젝트가 있어도 force면 purge된다", async () => {
    await ensureWorkspace("ws1", "/tmp/p");
    const r = await deleteWorkspace("ws1", { purge: true, force: true });
    expect(r.ok).toBe(true);
    expect(existsSync(workspaceDir("ws1"))).toBe(false);
  });
});

/**
 * 이름이 그대로 경로에 붙으므로 traversal을 막지 않으면 `..`로 WORK 루트 밖을 지울 수 있다.
 * 화이트리스트(허용 문자만) + 삭제 직전 경로가 WORK base 하위인지 이중검증.
 */
describe("이름 화이트리스트 — traversal 방지", () => {
  it.each(["../evil", "a/b", "a\\b", "..", ".", "", "  ", "ws*1"])("거부: %j", async (name) => {
    const r = await deleteWorkspace(name, { purge: true, force: true });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("INVALID_WORKSPACE_NAME");
  });

  it("traversal 이름으로 WORK 루트 밖 파일을 지우지 못한다", async () => {
    const outside = join(fakeHome, ".claude", "sugo", "outside");
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "keep.txt"), "keep");

    await deleteWorkspace("../outside", { purge: true, force: true });
    expect(existsSync(join(outside, "keep.txt"))).toBe(true);
  });

  it("허용: 영숫자·하이픈·언더스코어·점", async () => {
    for (const name of ["ws1", "my-ws", "my_ws", "ws.v2"]) {
      await ensureWorkspace(name);
      const r = await deleteWorkspace(name);
      expect(r.ok, name).toBe(true);
    }
  });
});

describe("un-delete — getOrCreateWorkspace 재사용", () => {
  it("삭제된 이름으로 ensureWorkspace를 부르면 되살아난다", async () => {
    await ensureWorkspace("ws1", "/tmp/p");
    await deleteWorkspace("ws1");
    expect((await loadWorkspace("ws1"))!.deleted_at).toBeTruthy();

    const revived = await ensureWorkspace("ws1");
    expect(revived.deleted_at).toBeUndefined();
    expect((await listWorkspaces()).map((w) => w.name)).toEqual(["ws1"]);
    // 기존 프로젝트 목록이 보존돼야 한다(삭제는 숨김이었지 소멸이 아니었으므로).
    expect(revived.projects).toEqual(["/tmp/p"]);
  });

  it("purge 후 같은 이름을 다시 만들면 빈 워크스페이스다", async () => {
    await ensureWorkspace("ws1", "/tmp/p");
    await deleteWorkspace("ws1", { purge: true, force: true });

    const fresh = await ensureWorkspace("ws1");
    expect(fresh.projects).toEqual([]);
    expect(fresh.deleted_at).toBeUndefined();
  });
});

/** 도구 표면: `sugo_workspace delete`에 `force`/`purge`/`keep_data`가 노출된다. */
describe("sugo_workspace(delete) — 도구 표면", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function call(args: unknown): Promise<any> {
    const { handleSugoWorkspace } = await import("../src/tools/sugoWorkspace.js");
    const res = (await handleSugoWorkspace(args)) as { isError?: boolean; content: { text: string }[] };
    return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
  }

  it("기본 delete는 soft이고 복구 방법을 응답에 알려준다", async () => {
    await call({ action: "add", name: "ws1" });
    const r = await call({ action: "delete", name: "ws1" });
    expect(r.isError).toBe(false);
    expect(r.data.mode).toBe("soft");
    expect(r.data.note).toContain("복구");
    expect((await call({ action: "list" })).data.workspaces).toEqual([]);
    expect((await call({ action: "list", includeDeleted: true })).data.workspaces).toHaveLength(1);
  });

  it("add로 되살아난다", async () => {
    await call({ action: "add", name: "ws1", projectPath: "/tmp/p" });
    await call({ action: "delete", name: "ws1" });
    await call({ action: "add", name: "ws1" });
    const list = (await call({ action: "list" })).data.workspaces;
    expect(list).toHaveLength(1);
    expect(list[0].projects).toEqual(["/tmp/p"]);
  });

  it("purge는 프로젝트가 붙어 있으면 force 없이 거부된다", async () => {
    await call({ action: "add", name: "ws1", projectPath: "/tmp/p" });
    const r = await call({ action: "delete", name: "ws1", purge: true });
    expect(r.isError).toBe(true);
    expect(r.data.errorCode).toBe("WORKSPACE_HAS_PROJECTS");
  });

  it("purge+force+keep_data 조합이 그대로 전달된다", async () => {
    await call({ action: "add", name: "ws1", projectPath: "/tmp/p" });
    const r = await call({ action: "delete", name: "ws1", purge: true, force: true, keep_data: true });
    expect(r.isError).toBe(false);
    expect(r.data.mode).toBe("purge");
    expect(r.data.dataRemoved).toBe(false);
  });

  it("name 없이 부르면 거부한다", async () => {
    expect((await call({ action: "delete" })).isError).toBe(true);
  });
});
