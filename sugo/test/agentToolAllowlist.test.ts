import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const AGENTS_DIR = join(__dirname, "..", "agents");
const AGENTS = ["code-agent.md", "test-agent.md", "review-agent.md", "docs-agent.md"] as const;

describe("Sugo agent tool allowlist", () => {
  it.each(AGENTS)("%s는 Claude Code 기본 도구와 Sugo MCP 도구만 허용한다", (agentFile) => {
    const source = readFileSync(join(AGENTS_DIR, agentFile), "utf8");
    const tools = (source.match(/^tools:\s*(.+)$/m)?.[1] ?? "").split(",").map((tool) => tool.trim());

    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      if (tool.startsWith("mcp__")) expect(tool, `${agentFile}: ${tool}`).toMatch(/^mcp__plugin_sugo_sugo__/);
    }
  });
});
