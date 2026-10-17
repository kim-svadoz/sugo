import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyExtraTools, readExtraTools } from "../hooks/agent-tools.mjs";

const pluginDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const hookPath = join(pluginDir, "hooks", "agent-tools.mjs");
const AGENT = "---\nname: code-agent\ntools: Read, Edit, mcp__plugin_sugo_sugo__sugo_plan\n---\n본문\n";

let root: string;
let home: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sugo-agent-tools-root-"));
  home = mkdtempSync(join(tmpdir(), "sugo-agent-tools-home-"));
  cpSync(join(pluginDir, "agents"), join(root, "agents"), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

function writeSettings(settings: unknown) {
  mkdirSync(join(home, ".claude", "sugo"), { recursive: true });
  writeFileSync(join(home, ".claude", "sugo", "settings.json"), JSON.stringify(settings));
}

function runHook() {
  return spawnSync(process.execPath, [hookPath], {
    encoding: "utf8",
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: root, SUGO_HOME_OVERRIDE: home },
  });
}

function toolsOf(agentFile: string) {
  return (readFileSync(join(root, "agents", agentFile), "utf8").match(/^tools:\s*(.+)$/m)?.[1] ?? "").split(", ");
}

describe("applyExtraTools", () => {
  it("기본 도구 뒤에 설정한 외부 도구를 붙인다", () => {
    expect(applyExtraTools(AGENT, ["mcp__team-knowledge__search"])).toContain(
      "tools: Read, Edit, mcp__plugin_sugo_sugo__sugo_plan, mcp__team-knowledge__search",
    );
  });

  it("설정이 비면 이전에 붙인 외부 도구를 지우고, 바뀔 것이 없으면 null을 돌려준다", () => {
    const withExtra = applyExtraTools(AGENT, ["mcp__team-knowledge__search"])!;
    expect(applyExtraTools(withExtra, [])).toBe(AGENT);
    expect(applyExtraTools(AGENT, [])).toBeNull();
    expect(applyExtraTools(withExtra, ["mcp__team-knowledge__search"])).toBeNull();
  });
});

describe("readExtraTools", () => {
  it("mcp__ 도구 이름만 받고 중복과 쉼표가 든 값은 버린다", () => {
    writeSettings({ agents: { extraTools: ["mcp__a__x", "mcp__a__x", "Bash", "mcp__b__y, Write", 3] } });
    expect(readExtraTools(join(home, ".claude", "sugo", "settings.json"))).toEqual(["mcp__a__x"]);
  });
});

describe("agent-tools SessionStart hook", () => {
  it("설정이 없으면 배포된 에이전트 정의를 바꾸지 않고 아무것도 출력하지 않는다", () => {
    const before = readFileSync(join(root, "agents", "code-agent.md"), "utf8");
    const result = runHook();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(readFileSync(join(root, "agents", "code-agent.md"), "utf8")).toBe(before);
  });

  it("설정한 도구를 모든 에이전트에 붙이고, 설정을 지우면 원래 목록으로 돌아간다", () => {
    const before = toolsOf("review-agent.md");
    writeSettings({ agents: { extraTools: ["mcp__team-knowledge__search"] } });
    expect(runHook().stdout).toContain("4개");
    for (const agent of ["code-agent.md", "test-agent.md", "review-agent.md", "docs-agent.md"]) {
      expect(toolsOf(agent)).toContain("mcp__team-knowledge__search");
    }
    expect(runHook().stdout).toBe("");

    writeSettings({});
    runHook();
    expect(toolsOf("review-agent.md")).toEqual(before);
  });
});
