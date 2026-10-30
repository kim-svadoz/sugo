import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleSugoAdd } from "../src/tools/sugoAdd.js";
import { handleSugoDelete } from "../src/tools/sugoDelete.js";
import { handleSugoDisable } from "../src/tools/sugoDisable.js";
import { handleSugoEnable } from "../src/tools/sugoEnable.js";
import { handleSugoReset } from "../src/tools/sugoReset.js";
import { handleSugoStatus } from "../src/tools/sugoStatus.js";
import { handleSugoUpdate } from "../src/tools/sugoUpdate.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(handler: (args: unknown) => Promise<any>, args?: unknown) {
  const res = await handler(args);
  return { isError: !!res.isError, data: JSON.parse(res.content[0].text) };
}

let fakeHome: string;
let projectDir: string;

beforeEach(() => {
  fakeHome = mkdtempSync(join(tmpdir(), "sugo-lifecycle-home-"));
  projectDir = mkdtempSync(join(tmpdir(), "sugo-lifecycle-project-"));
  process.env.SUGO_HOME_OVERRIDE = fakeHome;
  writeFileSync(join(projectDir, "package.json"), JSON.stringify({ dependencies: {}, devDependencies: { typescript: "^5.4.0" } }));
  writeFileSync(join(projectDir, "tsconfig.json"), "{}");
});

afterEach(() => {
  delete process.env.SUGO_HOME_OVERRIDE;
  rmSync(fakeHome, { recursive: true, force: true });
  rmSync(projectDir, { recursive: true, force: true });
});

describe("sugo_update — 등록된 프로젝트만 갱신 가능", () => {
  it("등록 안 된 프로젝트를 update하면 거부한다(반드시 거부)", async () => {
    const result = await call(handleSugoUpdate, { projectPath: projectDir });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("PROJECT_NOT_REGISTERED");
  });

  it("등록된 프로젝트는 workspace를 안 줘도 기존 소속을 유지한다", async () => {
    await call(handleSugoAdd, { projectPath: projectDir, workspace: "ws-keep" });
    const updated = await call(handleSugoUpdate, { projectPath: projectDir });
    expect(updated.isError).toBe(false);
    expect(updated.data.workspace).toBe("ws-keep");
  });
});

describe("sugo_disable / sugo_enable", () => {
  it("등록 안 된 프로젝트는 거부한다", async () => {
    const result = await call(handleSugoDisable, { projectPath: projectDir });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("PROJECT_NOT_REGISTERED");
  });

  it("disable→status에 반영되고, enable로 되돌릴 수 있다", async () => {
    await call(handleSugoAdd, { projectPath: projectDir });
    await call(handleSugoDisable, { projectPath: projectDir });
    const statusAfterDisable = await call(handleSugoStatus);
    expect(statusAfterDisable.data.projects[0].disabled).toBe(true);

    await call(handleSugoEnable, { projectPath: projectDir });
    const statusAfterEnable = await call(handleSugoStatus);
    expect(statusAfterEnable.data.projects[0].disabled).toBe(false);
  });
});

describe("sugo_reset — 적용된 하네스만 지우고 등록은 유지", () => {
  it("harness 산출물을 지우고 CLAUDE.md를 초기화하지만, 레지스트리 등록은 그대로 유지한다", async () => {
    await call(handleSugoAdd, { projectPath: projectDir });
    const reset = await call(handleSugoReset, { projectPath: projectDir });
    expect(reset.isError).toBe(false);
    expect(reset.data.backedUpTo).toBeDefined();

    const status = await call(handleSugoStatus);
    expect(status.data.projects).toHaveLength(1); // 레지스트리엔 여전히 등록돼 있다
    expect(status.data.projects[0].appliedHarnessCount).toBe(0); // 적용된 하네스는 비워짐
  });

  it("등록 안 된 프로젝트는 거부한다", async () => {
    const result = await call(handleSugoReset, { projectPath: projectDir });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("PROJECT_NOT_REGISTERED");
  });
});

describe("sugo_delete — 등록 해제", () => {
  it("delete 후 sugo_status에서 사라진다", async () => {
    await call(handleSugoAdd, { projectPath: projectDir });
    const del = await call(handleSugoDelete, { projectPath: projectDir });
    expect(del.isError).toBe(false);
    const status = await call(handleSugoStatus);
    expect(status.data.projects).toHaveLength(0);
  });

  it("등록 안 된 프로젝트를 delete하면 거부한다", async () => {
    const result = await call(handleSugoDelete, { projectPath: projectDir });
    expect(result.isError).toBe(true);
    expect(result.data.errorCode).toBe("PROJECT_NOT_REGISTERED");
  });
});

describe("sugo_status", () => {
  it("등록된 프로젝트가 없으면 빈 목록", async () => {
    const status = await call(handleSugoStatus);
    expect(status.data.totalProjects).toBe(0);
    expect(status.data.projects).toEqual([]);
  });

  it("등록된 프로젝트의 언어/프레임워크/하네스 개수를 보여준다", async () => {
    await call(handleSugoAdd, { projectPath: projectDir });
    const status = await call(handleSugoStatus);
    expect(status.data.totalProjects).toBe(1);
    expect(status.data.projects[0].languages).toContain("TypeScript");
    expect(status.data.projects[0].appliedHarnessCount).toBeGreaterThan(0);
  });
});
