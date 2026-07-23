import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoCheckpoint } from "../src/tools/sugoCheckpoint.js";
import { handleSugoOverview } from "../src/tools/sugoOverview.js";
import { handleSugoRoute } from "../src/tools/sugoRoute.js";
import { handleSugoVersion } from "../src/tools/sugoVersion.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(handler: (args: unknown) => Promise<any>, args?: unknown) {
  const res = await handler(args);
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

let fakeHome: string;
let projectDir: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-misc-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "sugo-misc-project-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

describe("sugo_overview 도구", () => {
  it("프로젝트를 스스로 걸어 클래스를 추출한다(파일 목록을 안 줘도 됨)", async () => {
    writeFileSync(join(projectDir, "App.ts"), "export class App {\n  run() {}\n}\n");
    const result = await call(handleSugoOverview, { projectPath: projectDir });
    expect(result.isError).toBe(false);
    expect(result.data.scannedFileCount).toBe(1);
    const classes = result.data.outlines[0].entries.filter((e: { kind: string }) => e.kind === "class");
    expect(classes.map((c: { name: string }) => c.name)).toEqual(["App"]);
  });
});

describe("sugo_version 도구", () => {
  it("버전 문자열을 반환한다(readOnly)", async () => {
    const result = await call(handleSugoVersion);
    expect(result.isError).toBe(false);
    expect(typeof result.data.version).toBe("string");
    expect(result.data.updateCheckAvailable).toBe(false);
  });
});

describe("sugo_route 도구", () => {
  it("자연어 입력을 (agent, skill)로 라우팅한다", async () => {
    const result = await call(handleSugoRoute, { input: "이 버그 좀 고쳐줘" });
    expect(result.isError).toBe(false);
    expect(result.data.matched).toBe(true);
    expect(result.data.route.agent).toBe("code-agent");
  });
});

describe("sugo_checkpoint 신규 action(get/remove/memory/read_memory/migrate/sync)", () => {
  it("get으로 단일 체크포인트를 조회한다", async () => {
    const added = await call(handleSugoCheckpoint, {
      action: "add",
      workspace: "ws1",
      title: "커밋 전 체크",
      checklist: ["A", "B"],
    });
    const got = await call(handleSugoCheckpoint, { action: "get", workspace: "ws1", id: added.data.checkpoint.id });
    expect(got.isError).toBe(false);
    expect(got.data.checkpoint.title).toBe("커밋 전 체크");
  });

  it("없는 id를 get하면 거부한다", async () => {
    const result = await call(handleSugoCheckpoint, { action: "get", workspace: "ws1", id: "CP-nope" });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("CHECKPOINT_NOT_FOUND");
  });

  it("remove로 체크포인트를 지운다", async () => {
    const added = await call(handleSugoCheckpoint, { action: "add", workspace: "ws1", title: "임시", checklist: ["X"] });
    const removed = await call(handleSugoCheckpoint, { action: "remove", workspace: "ws1", id: added.data.checkpoint.id });
    expect(removed.isError).toBe(false);
    const list = await call(handleSugoCheckpoint, { action: "list", workspace: "ws1" });
    expect(list.data.checkpoints).toHaveLength(0);
  });

  it("memory/read_memory로 자유 메모를 남기고 읽는다", async () => {
    await call(handleSugoCheckpoint, { action: "memory", workspace: "ws1", note: "다음엔 이거 조심" });
    const read = await call(handleSugoCheckpoint, { action: "read_memory", workspace: "ws1" });
    expect(read.data.memory).toContain("다음엔 이거 조심");
  });

  it("migrate는 모든 체크포인트를 정규화하고 개수를 반환한다", async () => {
    await call(handleSugoCheckpoint, { action: "add", workspace: "ws1", title: "A", checklist: ["1"] });
    await call(handleSugoCheckpoint, { action: "add", workspace: "ws1", title: "B", checklist: ["2"] });
    const migrated = await call(handleSugoCheckpoint, { action: "migrate", workspace: "ws1" });
    expect(migrated.data.migratedCount).toBe(2);
    const list = await call(handleSugoCheckpoint, { action: "list", workspace: "ws1" });
    expect(list.data.checkpoints).toHaveLength(2);
  });

  it("대시보드 disabled면 sync는 조용히 통과한다(§7.2 논블로킹)", async () => {
    const added = await call(handleSugoCheckpoint, { action: "add", workspace: "ws1", title: "동기화 대상", checklist: ["1"] });
    const synced = await call(handleSugoCheckpoint, { action: "sync", workspace: "ws1", id: added.data.checkpoint.id });
    expect(synced.isError).toBe(false);
    expect(synced.data.synced).toBe(true);
  });
});
