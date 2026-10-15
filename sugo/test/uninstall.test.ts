import { mkdtemp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { syncProjectHarness } from "../src/harness/sync.js";
import { handleSugoUninstall } from "../src/tools/sugoUninstall.js";
import { handleSugoAdd } from "../src/tools/sugoAdd.js";

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

describe("sugo_uninstall — 설치/제거 대칭성", () => {
  const exec = promisify(execFile);
  let home: string;
  let project: string;

  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "sugo-uninstall-home-"));
    project = await mkdtemp(join(tmpdir(), "sugo-uninstall-project-"));
    process.env.SUGO_HOME_OVERRIDE = home;
    await writeFile(join(project, "package.json"), JSON.stringify({ dependencies: { express: "1.0.0" } }));
    await mkdir(join(project, ".claude", "rules"), { recursive: true });
    await writeFile(join(project, "CLAUDE.md"), "# User Claude\n\nKeep this exact.\n");
    await writeFile(join(project, "AGENTS.md"), "# User Agents\n\nKeep this too.\n");
    await writeFile(join(project, ".claude", "rules", "user.md"), "user owned\n");
  });

  it("preview는 아무것도 지우지 않고 확인 문자열을 안내한다", async () => {
    await syncProjectHarness({ projectPath: project });
    const result = await handleSugoUninstall({ action: "preview" });
    const body = JSON.parse(result.content[0].text);
    expect(body.ok).toBe(true);
    expect(body.requiredConfirmation).toBe("UNINSTALL_SUGO");
    expect(await exists(join(project, "sugo", "config.json"))).toBe(true);
  });

  it("일반 제거는 영향 경로를 해제하고 데이터를 비활성 보관한다", async () => {
    await syncProjectHarness({ projectPath: project });
    const result = await handleSugoUninstall({ action: "execute", mode: "retain", confirmation: "UNINSTALL_SUGO" });
    const body = JSON.parse(result.content[0].text);
    expect(body.ok).toBe(true);
    expect(body.verifiedClean).toBe(true);
    expect(await readFile(join(project, "CLAUDE.md"), "utf8")).toBe("# User Claude\n\nKeep this exact.\n");
    expect(await readFile(join(project, "AGENTS.md"), "utf8")).toBe("# User Agents\n\nKeep this too.\n");
    expect(await readFile(join(project, ".claude", "rules", "user.md"), "utf8")).toBe("user owned\n");
    expect(await exists(join(project, "sugo"))).toBe(false);
    expect(await exists(join(home, ".claude", "sugo"))).toBe(false);
    expect(await exists(join(home, ".sugo", "data", "registry.json"))).toBe(true);
  });

  it("확인 문자열이 다르면 삭제를 거부한다", async () => {
    await syncProjectHarness({ projectPath: project });
    const result = await handleSugoUninstall({ action: "execute", mode: "purge", confirmation: "yes" });
    expect(result.isError).toBe(true);
    expect(await exists(join(project, "sugo", "config.json"))).toBe(true);
  });

  it("설치 전부터 있던 sugo 디렉터리의 사용자 파일은 보존한다", async () => {
    await mkdir(join(project, "sugo"), { recursive: true });
    await writeFile(join(project, "sugo", "user-notes.md"), "do not delete\n");
    await syncProjectHarness({ projectPath: project });
    const result = await handleSugoUninstall({ action: "execute", mode: "purge", confirmation: "DELETE_SUGO_DATA" });
    const body = JSON.parse(result.content[0].text);
    expect(await readFile(join(project, "sugo", "user-notes.md"), "utf8")).toBe("do not delete\n");
    expect(await exists(join(project, "sugo", "config.json"))).toBe(false);
    expect(body.preserved[0].paths[0]).toContain("설치 전부터 존재");
  });

  it("purge는 활성·보관 데이터와 독립 제거기를 모두 삭제한다", async () => {
    await syncProjectHarness({ projectPath: project });
    await mkdir(join(home, ".sugo", "bin"), { recursive: true });
    await writeFile(join(home, ".sugo", "bin", "sugo-uninstall.mjs"), "placeholder");
    const result = await handleSugoUninstall({ action: "execute", mode: "purge", confirmation: "DELETE_SUGO_DATA" });
    const body = JSON.parse(result.content[0].text);
    expect(body.verifiedClean).toBe(true);
    expect(await exists(join(home, ".sugo"))).toBe(false);
    expect(await exists(join(home, ".claude", "sugo"))).toBe(false);
  });

  it("재설치만으로는 영향이 돌아오지 않고 명시 restore에서만 다시 연결한다", async () => {
    await syncProjectHarness({ projectPath: project, workspace: "restored-ws" });
    await handleSugoUninstall({ action: "execute", mode: "retain", confirmation: "UNINSTALL_SUGO" });
    expect(await exists(join(project, ".claude", "rules", "default.md"))).toBe(false);
    const restored = await handleSugoUninstall({ action: "restore" });
    const body = JSON.parse(restored.content[0].text);
    expect(body.restoredProjects).toBe(1);
    expect(await exists(join(project, ".claude", "rules", "default.md"))).toBe(true);
    expect(await exists(join(home, ".claude", "sugo", "registry.json"))).toBe(true);
  });

  it("보관 데이터가 있으면 새 등록을 차단하고 복구 또는 폐기 결정을 요구한다", async () => {
    await syncProjectHarness({ projectPath: project });
    await handleSugoUninstall({ action: "execute", mode: "retain", confirmation: "UNINSTALL_SUGO" });
    const blocked = await handleSugoAdd({ projectPath: project });
    expect(blocked.isError).toBe(true);
    expect(JSON.parse(blocked.content[0].text).errorCode).toBe("RETAINED_DATA_DECISION_REQUIRED");
    await handleSugoUninstall({ action: "discard", confirmation: "DELETE_RETAINED_DATA" });
    const fresh = await handleSugoAdd({ projectPath: project });
    expect(fresh.isError).not.toBe(true);
  });

  it("플러그인 캐시가 없어도 독립 제거기가 같은 비활성 제거를 수행한다", async () => {
    await syncProjectHarness({ projectPath: project });
    await exec(process.execPath, ["scripts/sugo-uninstall-standalone.mjs", "uninstall"], {
      cwd: process.cwd(), env: { ...process.env, SUGO_HOME_OVERRIDE: home },
    });
    expect(await exists(join(project, "sugo"))).toBe(false);
    expect(await readFile(join(project, "CLAUDE.md"), "utf8")).toBe("# User Claude\n\nKeep this exact.\n");
    expect(await exists(join(home, ".claude", "sugo"))).toBe(false);
    expect(await exists(join(home, ".sugo", "data", "registry.json"))).toBe(true);
  });
});
