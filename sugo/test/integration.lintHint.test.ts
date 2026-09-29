import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const HOOK_PATH = join(__dirname, "..", "hooks", "lint-hint.mjs");

let tmpDirs: string[] = [];

function makeProject(lintCommand: string | undefined): string {
  const dir = mkdtempSync(join(tmpdir(), "sugo-linthint-e2e-"));
  tmpDirs.push(dir);
  mkdirSync(join(dir, "sugo"), { recursive: true });
  writeFileSync(
    join(dir, "sugo", "config.json"),
    JSON.stringify({ detectedStack: { commands: lintCommand ? { lint: lintCommand } : {} } }),
  );
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "foo.ts"), "export const x = 1;\n");
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
  tmpDirs = [];
});

function runHook(projectDir: string, cooldownMs = 0) {
  return spawnSync("node", [HOOK_PATH], {
    input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: join(projectDir, "src", "foo.ts") } }),
    encoding: "utf-8",
    env: { ...process.env, SUGO_LINT_HINT_COOLDOWN_MS: String(cooldownMs) },
  });
}

describe("lint-hint 훅 — 실배선(실제 subprocess로 node hooks/lint-hint.mjs 실행)", () => {
  it("lint가 통과하면 exit 0, stderr 없음", () => {
    const dir = makeProject(`node -e "process.exit(0)"`);
    const result = runHook(dir);
    expect(result.status).toBe(0);
    expect(result.stderr.trim()).toBe("");
  });

  it("lint가 실패하면 exit 2와 함께 실패 요약을 stderr로 낸다(편집 자체는 막지 않는다는 문구 포함)", () => {
    const dir = makeProject(`node -e "console.error('src/foo.ts: unused var'); process.exit(1)"`);
    const result = runHook(dir);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("lint-hint");
    expect(result.stderr).toContain("편집 자체는 막지 않습니다");
    expect(result.stderr).toContain("unused var");
  });

  it("lint 명령이 감지되지 않은 프로젝트면 조용히 exit 0", () => {
    const dir = makeProject(undefined);
    const result = runHook(dir);
    expect(result.status).toBe(0);
    expect(result.stderr.trim()).toBe("");
  });

  it("등록되지 않은(sugo/config.json 없는) 경로면 조용히 exit 0", () => {
    const dir = mkdtempSync(join(tmpdir(), "sugo-linthint-unreg-"));
    tmpDirs.push(dir);
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "foo.ts"), "export const x = 1;\n");
    const result = spawnSync("node", [HOOK_PATH], {
      input: JSON.stringify({ tool_name: "Edit", tool_input: { file_path: join(dir, "src", "foo.ts") } }),
      encoding: "utf-8",
    });
    expect(result.status).toBe(0);
  });

  it("쿨다운 안에서는 실패하는 lint여도 두 번째 호출은 건너뛴다", () => {
    const dir = makeProject(`node -e "process.exit(1)"`);
    const first = runHook(dir, 60000); // 60초 쿨다운
    expect(first.status).toBe(2);
    const second = runHook(dir, 60000);
    expect(second.status).toBe(0); // 쿨다운 중이라 이번엔 안 돌리고 조용히 통과
  });
});
