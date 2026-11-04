import { execFile } from "node:child_process";

export type McpClient = "claude" | "codex";
export type McpClientCheck = { client: McpClient; output: string; succeeded: boolean };
export type WikiMcpStatus = {
  registration: "complete" | "missing";
  authentication: "complete" | "required" | "unknown" | "blocked";
  clients: McpClient[];
};

function isRegistered(output: string): boolean {
  return !/no mcp server (?:found with name|named)/i.test(output)
    && (/scope:\s*(?:user|local|project)/i.test(output) || /"name"\s*:\s*"atlassian"/i.test(output) || /type:\s*(?:http|stdio|sse)/i.test(output));
}

export function summarizeWikiMcpChecks(checks: McpClientCheck[]): WikiMcpStatus {
  const registered = checks.filter((check) => isRegistered(check.output));
  const clients = registered.map((check) => check.client);
  if (registered.length === 0) return { registration: "missing", authentication: "blocked", clients: [] };
  if (registered.some((check) => /status:\s*[✔✓].*connected/i.test(check.output))) {
    return { registration: "complete", authentication: "complete", clients };
  }
  if (registered.some((check) => /needs authentication|authentication required|not authenticated/i.test(check.output))) {
    return { registration: "complete", authentication: "required", clients };
  }
  return { registration: "complete", authentication: "unknown", clients };
}

function run(client: McpClient, command: string, args: string[]): Promise<McpClientCheck> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 5_000 }, (error, stdout, stderr) => {
      resolve({ client, output: `${stdout ?? ""}\n${stderr ?? ""}`.trim(), succeeded: !error });
    });
  });
}

export async function inspectWikiMcpStatus(): Promise<WikiMcpStatus> {
  const checks = await Promise.all([
    run("claude", "claude", ["mcp", "get", "atlassian"]),
    run("codex", "codex", ["mcp", "get", "atlassian", "--json"]),
  ]);
  return summarizeWikiMcpChecks(checks);
}
