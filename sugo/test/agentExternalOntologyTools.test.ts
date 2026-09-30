import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const AGENTS_DIR = join(__dirname, "..", "agents");
const AGENTS = ["code-agent.md", "test-agent.md", "review-agent.md", "docs-agent.md"] as const;

const READ_ONLY_DOMAIN_ONTOLOGY_TOOLS = [
  "get_capability_status",
  "explain_recommendation_layers",
  "find_evidence",
  "get_area_config",
  "get_entity_context",
  "get_inbox_entry",
  "get_ingestion_candidate",
  "get_ontology_revision",
  "get_question_context",
  "get_serving_code_context",
  "get_work_item",
  "get_work_item_next_actions",
  "list_ingestion_candidates",
  "list_recommendation_mappings",
  "list_unresolved",
  "list_work_items",
  "scan_workspace_changes",
  "search_config-manager_config",
  "search_ontology",
  "search_serving_code",
  "summarize_recommendation_module",
  "trace_connections",
  "trace_model_delivery",
  "validate_ontology",
] as const;

describe("Sugo agent ↔ optional domain-ontology-mcp contract", () => {
  it.each(AGENTS)("%s가 업데이트 후에도 읽기 전용 ontology 도구를 허용한다", (agentFile) => {
    const source = readFileSync(join(AGENTS_DIR, agentFile), "utf8");
    const toolsLine = source.match(/^tools:\s*(.+)$/m)?.[1] ?? "";

    for (const tool of READ_ONLY_DOMAIN_ONTOLOGY_TOOLS) {
      expect(toolsLine, `${agentFile}: ${tool}`).toContain(`mcp__domain-ontology-mcp__${tool}`);
    }
  });

  it.each(AGENTS)("%s가 MCP 미설치 환경의 폴백을 명시한다", (agentFile) => {
    const source = readFileSync(join(AGENTS_DIR, agentFile), "utf8");
    expect(source).toContain("domain-ontology-mcp");
    expect(source).toContain("사용 가능할 때만");
    expect(source).toContain("로컬 코드 탐색");
  });

  it("상태를 바꾸는 ontology 도구는 에이전트 허용목록에 넣지 않는다", () => {
    const forbidden = [
      "create_work_item",
      "transition_work_item",
      "propose_ontology_updates",
      "resolve_work_item_decision",
      "record_work_item_analysis",
      "record_work_item_validation",
      "sync_search_index",
    ];

    for (const agentFile of AGENTS) {
      const source = readFileSync(join(AGENTS_DIR, agentFile), "utf8");
      const toolsLine = source.match(/^tools:\s*(.+)$/m)?.[1] ?? "";
      for (const tool of forbidden) expect(toolsLine, `${agentFile}: ${tool}`).not.toContain(`mcp__domain-ontology-mcp__${tool}`);
    }
  });
});
