// sugo 플러그인 SessionStart 훅: 사용자가 opt-in한 외부 MCP 도구를 설치된 에이전트 정의에 붙인다.
//
// Claude Code는 플러그인 에이전트의 `tools` 목록을 사용자 설정으로 바꾸는 방법을 주지 않는다. 그래서
// ~/.claude/sugo/settings.json의 `agents.extraTools`(예: "mcp__team-knowledge__search" 또는
// "mcp__team-knowledge__*")를 설치된 플러그인 폴더(CLAUDE_PLUGIN_ROOT)의 agents/*.md `tools:` 줄에
// 맞춘다. 배포 소스에는 외부 도구가 없고, 설정을 지우면 다음 세션에 기본 목록으로 돌아간다.
// 에이전트 정의는 세션 시작 때 읽히므로 바뀐 목록은 /reload-plugins 또는 다음 세션부터 적용된다.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SUGO_TOOL_PREFIX = "mcp__plugin_sugo_sugo__";

function isBaseTool(tool) {
  return !tool.startsWith("mcp__") || tool.startsWith(SUGO_TOOL_PREFIX);
}

export function readExtraTools(settingsFile) {
  try {
    const tools = JSON.parse(readFileSync(settingsFile, "utf8"))?.agents?.extraTools;
    return Array.isArray(tools)
      ? [...new Set(tools.filter((t) => typeof t === "string" && /^mcp__[^,\s]+$/.test(t.trim())).map((t) => t.trim()))]
      : [];
  } catch {
    return [];
  }
}

/** 에이전트 정의의 `tools:` 줄을 기본 도구 + extraTools로 맞춘다. 바뀔 것이 없으면 null. */
export function applyExtraTools(source, extraTools) {
  const match = /^tools:[ \t]*(.*)$/m.exec(source);
  if (!match) return null;
  const current = match[1].split(",").map((t) => t.trim()).filter(Boolean);
  const next = [...current.filter(isBaseTool), ...extraTools.filter((t) => !current.filter(isBaseTool).includes(t))];
  if (next.join(", ") === current.join(", ")) return null;
  return source.slice(0, match.index) + `tools: ${next.join(", ")}` + source.slice(match.index + match[0].length);
}

export function syncAgentTools(pluginRoot, settingsFile) {
  const extraTools = readExtraTools(settingsFile);
  const agentsDir = join(pluginRoot, "agents");
  const changed = [];
  for (const name of readdirSync(agentsDir).filter((f) => f.endsWith(".md"))) {
    const file = join(agentsDir, name);
    const next = applyExtraTools(readFileSync(file, "utf8"), extraTools);
    if (next !== null) {
      writeFileSync(file, next);
      changed.push(name);
    }
  }
  return changed;
}

function main() {
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) return;
  const settingsFile = join(process.env.SUGO_HOME_OVERRIDE ?? homedir(), ".claude", "sugo", "settings.json");
  try {
    const changed = syncAgentTools(pluginRoot, settingsFile);
    if (changed.length) {
      process.stdout.write(`Sugo 에이전트 도구 목록을 settings.json의 agents.extraTools에 맞췄습니다(${changed.length}개). /reload-plugins 후 적용됩니다.\n`);
    }
  } catch (error) {
    process.stdout.write(`Sugo 에이전트 도구 목록을 맞추지 못했습니다: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
