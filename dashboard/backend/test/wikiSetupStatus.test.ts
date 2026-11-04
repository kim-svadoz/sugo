import { describe, expect, it } from "vitest";
import { summarizeWikiMcpChecks, type McpClientCheck } from "../src/services/wikiSetupStatus.js";

describe("WIKI MCP setup status", () => {
  it("marks a connected client as registered and authorized", () => {
    const checks: McpClientCheck[] = [
      { client: "claude", output: "atlassian:\n  Scope: User config\n  Status: ✔ Connected\n  Type: http", succeeded: true },
    ];

    expect(summarizeWikiMcpChecks(checks)).toEqual({
      registration: "complete",
      authentication: "complete",
      clients: ["claude"],
    });
  });

  it("keeps registration complete while authentication is still required", () => {
    const checks: McpClientCheck[] = [
      { client: "claude", output: "atlassian:\n  Scope: User config\n  Status: ! Needs authentication", succeeded: true },
    ];

    expect(summarizeWikiMcpChecks(checks)).toEqual({
      registration: "complete",
      authentication: "required",
      clients: ["claude"],
    });
  });

  it("does not report an unreachable registered server as authenticated", () => {
    const checks: McpClientCheck[] = [
      { client: "claude", output: "atlassian:\n  Scope: User config\n  Status: ✘ Failed to connect\n  Type: http", succeeded: false },
    ];

    expect(summarizeWikiMcpChecks(checks)).toEqual({
      registration: "complete",
      authentication: "unknown",
      clients: ["claude"],
    });
  });

  it("reports missing when neither client has the server", () => {
    const checks: McpClientCheck[] = [
      { client: "claude", output: "No MCP server found with name: atlassian", succeeded: false },
      { client: "codex", output: "Error: No MCP server named 'atlassian' found.", succeeded: false },
    ];

    expect(summarizeWikiMcpChecks(checks)).toEqual({
      registration: "missing",
      authentication: "blocked",
      clients: [],
    });
  });
});
