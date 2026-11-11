import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ConsoleRuntimeDescriptor {
  source: "embedded";
  runtimeRoot: string;
  entryPath: string;
  consoleVersion: string;
  buildId: string;
}

export function resolveConsoleRuntime(pluginRoot: string): ConsoleRuntimeDescriptor | null {
  const runtimeRoot = join(pluginRoot, "dashboard-runtime");
  const entryPath = join(runtimeRoot, "server.mjs");
  const manifestPath = join(runtimeRoot, "runtime.json");
  if (!existsSync(entryPath) || !existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { consoleVersion?: unknown };
    if (typeof manifest.consoleVersion !== "string" || !manifest.consoleVersion.trim()) return null;
    return {
      source: "embedded",
      runtimeRoot,
      entryPath,
      consoleVersion: manifest.consoleVersion,
      buildId: `console-${manifest.consoleVersion}`,
    };
  } catch {
    return null;
  }
}
