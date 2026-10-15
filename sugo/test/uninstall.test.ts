import { mkdtemp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { syncProjectHarness } from "../src/harness/sync.js";
import { handleSugoUninstall } from "../src/tools/sugoUninstall.js";

async function exists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

describe("sugo_uninstall — 설치/제거 대칭성", () => {
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
    expect(body.requiredConfirmation).toBe("DELETE_SUGO_DATA");
    expect(await exists(join(project, "sugo", "config.json"))).toBe(true);
  });

  it("명시 확인 후 프로젝트와 전역 Sugo 데이터만 제거하고 사용자 설정을 원문 복원한다", async () => {
    await syncProjectHarness({ projectPath: project });
    const result = await handleSugoUninstall({ action: "execute", confirmation: "DELETE_SUGO_DATA" });
    const body = JSON.parse(result.content[0].text);
    expect(body.ok).toBe(true);
    expect(body.verifiedClean).toBe(true);
    expect(await readFile(join(project, "CLAUDE.md"), "utf8")).toBe("# User Claude\n\nKeep this exact.\n");
    expect(await readFile(join(project, "AGENTS.md"), "utf8")).toBe("# User Agents\n\nKeep this too.\n");
    expect(await readFile(join(project, ".claude", "rules", "user.md"), "utf8")).toBe("user owned\n");
    expect(await exists(join(project, "sugo"))).toBe(false);
    expect(await exists(join(home, ".claude", "sugo"))).toBe(false);
  });

  it("확인 문자열이 다르면 삭제를 거부한다", async () => {
    await syncProjectHarness({ projectPath: project });
    const result = await handleSugoUninstall({ action: "execute", confirmation: "yes" });
    expect(result.isError).toBe(true);
    expect(await exists(join(project, "sugo", "config.json"))).toBe(true);
  });

  it("설치 전부터 있던 sugo 디렉터리의 사용자 파일은 보존한다", async () => {
    await mkdir(join(project, "sugo"), { recursive: true });
    await writeFile(join(project, "sugo", "user-notes.md"), "do not delete\n");
    await syncProjectHarness({ projectPath: project });
    const result = await handleSugoUninstall({ action: "execute", confirmation: "DELETE_SUGO_DATA" });
    const body = JSON.parse(result.content[0].text);
    expect(await readFile(join(project, "sugo", "user-notes.md"), "utf8")).toBe("do not delete\n");
    expect(await exists(join(project, "sugo", "config.json"))).toBe(false);
    expect(body.preserved[0].paths[0]).toContain("설치 전부터 존재");
  });
});
