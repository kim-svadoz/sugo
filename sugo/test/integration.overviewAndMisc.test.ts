import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoAdd } from "../src/tools/sugoAdd.js";
import { handleSugoCheckpoint } from "../src/tools/sugoCheckpoint.js";
import { handleSugoGetProjectContext } from "../src/tools/sugoGetProjectContext.js";
import { handleSugoOverview } from "../src/tools/sugoOverview.js";
import { handleSugoPlan } from "../src/tools/sugoPlan.js";
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

  // §7.2 논블로킹은 맞지만, **하지 않은 일을 했다고 보고하면 안 된다.** 대시보드가 없는
  // 콜드 환경에서 sync가 `synced: true`를 돌려주고 있었다 — 논블로킹과 거짓보고는 다르다.
  it("대시보드 disabled면 sync는 막지 않되 synced:false로 사실대로 보고한다", async () => {
    const added = await call(handleSugoCheckpoint, { action: "add", workspace: "ws1", title: "동기화 대상", checklist: ["1"] });
    const synced = await call(handleSugoCheckpoint, { action: "sync", workspace: "ws1", id: added.data.checkpoint.id });
    expect(synced.isError).toBe(false); // 논블로킹 — 파이프라인을 막지 않는다
    expect(synced.data.synced).toBe(false);
    expect(synced.data.dashboard).toBe("disabled");
    expect(synced.data.note).toContain("로컬");
  });

  it("대시보드가 설정돼 있으면(서버가 죽어 있어도) 전송을 시도했다고 보고한다", async () => {
    process.env.SUGO_DASHBOARD_API_URL = "http://127.0.0.1:45124"; // 아무도 듣지 않는 포트
    try {
      const added = await call(handleSugoCheckpoint, { action: "add", workspace: "ws1", title: "동기화 대상", checklist: ["1"] });
      const synced = await call(handleSugoCheckpoint, { action: "sync", workspace: "ws1", id: added.data.checkpoint.id });
      expect(synced.isError).toBe(false);
      expect(synced.data.synced).toBe(true);
      expect(synced.data.dashboard).toBe("enabled");
    } finally {
      delete process.env.SUGO_DASHBOARD_API_URL;
    }
  });
});

describe("§2 하네스 도구 디스패치 — 레지스트리가 비어있는 기본 상태에서도 배선이 깨지지 않는다", () => {
  it("sugo_get_project_context는 harnessTools(빈 가이드)를 노출한다", async () => {
    writeFileSync(join(projectDir, "package.json"), JSON.stringify({ devDependencies: { typescript: "^5.4.0" } }));
    writeFileSync(join(projectDir, "tsconfig.json"), "{}");
    await call(handleSugoAdd, { projectPath: projectDir });
    const context = await call(handleSugoGetProjectContext, { projectPath: projectDir });
    expect(context.data.harnessTools).toEqual({ guides: [], mcpAllowPatterns: [], toolMenu: "" });
  });

  it("sugo_plan(code_start) 응답에 harnessToolMenu(빈 문자열)가 실린다", async () => {
    const start = await call(handleSugoPlan, { action: "start", projectPath: projectDir, featureName: "x" });
    const sessionId = start.data.sessionId;
    await call(handleSugoPlan, { action: "clarify", sessionId });
    await call(handleSugoPlan, { action: "prd", sessionId, prdContent: "REQ-1: 아무거나. " + "가".repeat(90) });
    await call(handleSugoPlan, { action: "ready", sessionId });
    await call(handleSugoPlan, { action: "baseline_capture", sessionId });
    await call(handleSugoPlan, { action: "contract_start", sessionId });
    await call(handleSugoPlan, { action: "contract_done", sessionId });
    const codeStart = await call(handleSugoPlan, { action: "code_start", sessionId });
    expect(codeStart.data.harnessToolMenu).toBe("");
  });
});
