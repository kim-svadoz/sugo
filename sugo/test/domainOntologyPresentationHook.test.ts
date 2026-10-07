import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildPresentationReminder,
  isDomainOntologyTool,
} from "../hooks/domain-ontology-presentation.mjs";

const testDir = dirname(fileURLToPath(import.meta.url));
const hookPath = join(testDir, "..", "hooks", "domain-ontology-presentation.mjs");
const hooksConfigPath = join(testDir, "..", "hooks", "hooks.json");

describe("shop ontology presentation hook", () => {
  it("domain-ontology-mcp 도구만 식별한다", () => {
    expect(isDomainOntologyTool("mcp__domain-ontology-mcp__search_ontology")).toBe(true);
    expect(isDomainOntologyTool("mcp__domain-ontology-mcp__find_evidence")).toBe(true);
    expect(isDomainOntologyTool("mcp__plugin_sugo_sugo__sugo_ontology")).toBe(false);
    expect(isDomainOntologyTool("Read")).toBe(false);
  });

  it("사용자 출력에만 STE 원칙을 적용하고 사실 원본을 보존하도록 지시한다", () => {
    const reminder = buildPresentationReminder();
    expect(reminder).toContain("사용자에게 설명하거나 요약하는 문장");
    expect(reminder).toContain("내부 분석");
    expect(reminder).toContain("ste-inspired-ko");
    expect(reminder).toContain("식별자, 수치, 상태, 근거, 불확실성");
    expect(reminder).toContain("추가하거나 생략하지 마라");
  });

  it("PostToolUse 표준 JSON으로 additionalContext를 반환한다", () => {
    const result = spawnSync(process.execPath, [hookPath], {
      input: JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "mcp__domain-ontology-mcp__get_entity_context",
        tool_input: { entity: "orders" },
        tool_response: { content: [{ type: "text", text: "fact" }] },
      }),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    const output = JSON.parse(result.stdout);
    expect(output).toMatchObject({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
      },
    });
    expect(output.hookSpecificOutput.additionalContext).toContain("ste-inspired-ko");
  });

  it("다른 도구가 직접 실행 파일을 호출해도 조용히 종료한다", () => {
    const result = spawnSync(process.execPath, [hookPath], {
      input: JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Read" }),
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
  });

  it("플러그인 훅 설정이 shop ontology MCP 전체를 PostToolUse로 연결한다", () => {
    const config = JSON.parse(readFileSync(hooksConfigPath, "utf8"));
    const entry = config.hooks.PostToolUse.find((candidate: { matcher?: string }) =>
      candidate.matcher?.includes("shop"),
    );
    expect(entry?.matcher).toBe("^mcp__domain[-_]ontology[-_]mcp__.*$");
    expect(entry?.hooks?.[0]?.command).toContain("domain-ontology-presentation.mjs");
  });
});
