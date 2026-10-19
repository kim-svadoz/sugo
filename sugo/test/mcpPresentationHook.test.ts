import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildPresentationReminder,
  isPresentationTarget,
  mcpServerOf,
} from "../hooks/mcp-presentation.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const hookPath = join(testDir, "..", "hooks", "mcp-presentation.mjs");
const hooksConfigPath = join(testDir, "..", "hooks", "hooks.json");

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "sugo-mcp-presentation-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

function writeSettings(settings: unknown) {
  mkdirSync(join(home, ".claude", "sugo"), { recursive: true });
  writeFileSync(join(home, ".claude", "sugo", "settings.json"), JSON.stringify(settings));
}

function runHook(toolName: string) {
  return spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({
      hook_event_name: "PostToolUse",
      tool_name: toolName,
      tool_response: { content: [{ type: "text", text: "fact" }] },
    }),
    encoding: "utf8",
    env: { ...process.env, SUGO_HOME_OVERRIDE: home },
  });
}

describe("MCP presentation hook", () => {
  it("도구 이름에서 MCP 서버 이름을 읽는다", () => {
    expect(mcpServerOf("mcp__team-knowledge__search")).toBe("team-knowledge");
    expect(mcpServerOf("Read")).toBeNull();
  });

  it("사용자가 지정한 서버만 대상으로 보고 -와 _ 표기 차이는 같게 본다", () => {
    expect(isPresentationTarget("mcp__team_knowledge__search", ["team-knowledge"])).toBe(true);
    expect(isPresentationTarget("mcp__other-server__search", ["team-knowledge"])).toBe(false);
    expect(isPresentationTarget("mcp__team-knowledge__search", [])).toBe(false);
  });

  it("사용자 출력에만 STE 원칙을 적용하고 사실 값을 보존하도록 지시한다", () => {
    const reminder = buildPresentationReminder("team-knowledge");
    expect(reminder).toContain("team-knowledge");
    expect(reminder).toContain("사용자에게 설명하거나 요약하는 문장");
    expect(reminder).toContain("ste-inspired-ko");
    expect(reminder).toContain("식별자, 수치, 상태, 근거, 불확실성");
  });

  it("설정이 없으면 어떤 MCP 도구에도 아무것도 출력하지 않는다", () => {
    const result = runHook("mcp__team-knowledge__search");
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("settings.json의 presentation.mcpServers에 등록한 서버만 additionalContext를 반환한다", () => {
    writeSettings({ presentation: { mcpServers: ["team-knowledge"] } });

    const target = runHook("mcp__team-knowledge__search");
    expect(target.status).toBe(0);
    expect(JSON.parse(target.stdout).hookSpecificOutput).toMatchObject({ hookEventName: "PostToolUse" });

    const other = runHook("mcp__other-server__search");
    expect(other.status).toBe(0);
    expect(other.stdout).toBe("");
  });

  it("플러그인 훅 설정이 MCP 도구 전체를 PostToolUse로 연결한다", () => {
    const config = JSON.parse(readFileSync(hooksConfigPath, "utf8"));
    const entry = config.hooks.PostToolUse.find((candidate: { hooks?: { command?: string }[] }) =>
      candidate.hooks?.[0]?.command?.includes("mcp-presentation.mjs"),
    );
    expect(entry?.matcher).toBe("^mcp__.*$");
  });
});
