import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setHarnessFeatureEnabled } from "../src/harness/featureControl.js";
import { findRegistryEntry } from "../src/harness/registry.js";
import { moveSugoProject, removeSugoProject } from "../src/projectLifecycle.js";
import { registerSugoProject } from "../src/projectRegistration.js";
import { loadWorkspace } from "../src/work/workspace.js";

function makeProject(): string {
  const project = mkdtempSync(join(tmpdir(), "sugo-lifecycle-project-"));
  writeFileSync(join(project, "package.json"), JSON.stringify({ dependencies: { react: "^19.0.0" } }));
  writeFileSync(join(project, "tsconfig.json"), "{}");
  return project;
}

describe("프로젝트 제거와 경로 변경", () => {
  let home: string;
  let projects: string[];

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "sugo-lifecycle-home-"));
    process.env.SUGO_HOME_OVERRIDE = home;
    projects = [];
  });

  afterEach(() => {
    delete process.env.SUGO_HOME_OVERRIDE;
    rmSync(home, { recursive: true, force: true });
    for (const project of projects) rmSync(project, { recursive: true, force: true });
  });

  const project = () => { const path = makeProject(); projects.push(path); return path; };

  it("제거하면 자동 로딩 파일만 지우고 사용자 파일과 작업 기록은 남긴다", async () => {
    const path = project();
    mkdirSync(join(path, ".claude", "rules"), { recursive: true });
    writeFileSync(join(path, ".claude", "rules", "my-own.md"), "직접 만든 규칙\n");
    writeFileSync(join(path, "CLAUDE.md"), "# 내 메모\n");
    writeFileSync(join(path, "AGENTS.md"), "# 내 AGENTS 메모\n");
    await registerSugoProject({ projectPath: path, workspace: "demo" });
    mkdirSync(join(path, "sugo", "features", "login"), { recursive: true });
    writeFileSync(join(path, "sugo", "features", "login", "prd.md"), "# PRD\n");

    const result = await removeSugoProject(path);

    expect(result.removedFiles).toContain(".claude/rules/lang-typescript.md");
    expect(existsSync(join(path, ".claude", "rules", "lang-typescript.md"))).toBe(false);
    expect(existsSync(join(path, ".claude", "rules", "my-own.md"))).toBe(true);
    expect(readFileSync(join(path, "CLAUDE.md"), "utf8")).toBe("# 내 메모\n");
    expect(readFileSync(join(path, "AGENTS.md"), "utf8")).toBe("# 내 AGENTS 메모\n");
    expect(existsSync(join(path, "sugo", "harness"))).toBe(false);
    expect(existsSync(join(path, "sugo", "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(path, "sugo", "features", "login", "prd.md"))).toBe(true);
    expect(await findRegistryEntry(path)).toBeNull();
    expect((await loadWorkspace("demo"))?.projects).not.toContain(path);
  });

  it("Sugo가 만든 CLAUDE.md·AGENTS.md는 블록을 빼고 비면 파일째 지운다", async () => {
    const path = project();
    await registerSugoProject({ projectPath: path, workspace: "demo" });

    await removeSugoProject(path);

    expect(existsSync(join(path, "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(path, "AGENTS.md"))).toBe(false);
    expect(existsSync(join(path, ".claude", "rules"))).toBe(false);
  });

  it("폴더가 이미 사라진 프로젝트도 등록만 풀고 폴더를 다시 만들지 않는다", async () => {
    const path = project();
    await registerSugoProject({ projectPath: path, workspace: "demo" });
    rmSync(path, { recursive: true, force: true });

    const result = await removeSugoProject(path);

    expect(result.folderMissing).toBe(true);
    expect(existsSync(path)).toBe(false);
    expect(await findRegistryEntry(path)).toBeNull();
  });

  it("등록되지 않은 경로는 제거를 거부한다", async () => {
    await expect(removeSugoProject(project())).rejects.toMatchObject({ code: "PROJECT_NOT_REGISTERED" });
  });

  it("경로를 바꾸면 새 경로에 같은 워크스페이스로 등록하고 이전 경로의 자동 로딩 파일을 지운다", async () => {
    const from = project();
    const to = project();
    await registerSugoProject({ projectPath: from, workspace: "demo" });

    const result = await moveSugoProject({ from, to });

    expect(result.workspace).toBe("demo");
    expect(await findRegistryEntry(from)).toBeNull();
    expect((await findRegistryEntry(to))?.workspace).toBe("demo");
    expect((await loadWorkspace("demo"))?.projects).toEqual([to]);
    expect(existsSync(join(to, ".claude", "rules", "lang-typescript.md"))).toBe(true);
    expect(existsSync(join(from, ".claude", "rules", "lang-typescript.md"))).toBe(false);
  });

  it("이미 등록된 경로나 없는 폴더로는 경로를 바꾸지 않는다", async () => {
    const from = project();
    const other = project();
    await registerSugoProject({ projectPath: from, workspace: "demo" });
    await registerSugoProject({ projectPath: other, workspace: "demo" });

    await expect(moveSugoProject({ from, to: other })).rejects.toMatchObject({ code: "PROJECT_ALREADY_REGISTERED" });
    await expect(moveSugoProject({ from, to: join(home, "missing") })).rejects.toMatchObject({ code: "PROJECT_PATH_NOT_FOUND" });
    expect(await findRegistryEntry(from)).not.toBeNull();
  });

  it("하네스를 다시 켤 때 폴더가 사라진 프로젝트는 건너뛰고 폴더를 만들지 않는다", async () => {
    const kept = project();
    const gone = project();
    await registerSugoProject({ projectPath: kept, workspace: "demo" });
    await registerSugoProject({ projectPath: gone, workspace: "demo" });
    rmSync(gone, { recursive: true, force: true });

    await setHarnessFeatureEnabled(false);
    const result = await setHarnessFeatureEnabled(true);

    expect(existsSync(gone)).toBe(false);
    expect(result).toEqual({ enabled: true, projectCount: 1, skippedProjects: [gone] });
    expect(existsSync(join(kept, ".claude", "rules", "lang-typescript.md"))).toBe(true);
  });
});
