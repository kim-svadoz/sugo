import { existsSync, readFileSync, readdirSync } from "node:fs";
import { cp, mkdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { sugoHomeDir } from "../homeDir.js";
import { atomicWriteFile, withFileLock } from "../fsUtil.js";

export const CONSOLE_RUNTIME_SCHEMA_VERSION = 1;
export const CONSOLE_ENGINE_API_VERSION = 1;

export interface ConsoleRuntimeDescriptor {
  source: "external" | "embedded";
  runtimeRoot: string;
  entryPath: string;
  consoleVersion: string;
  buildId: string;
}

interface RuntimeManifest {
  runtimeSchemaVersion?: unknown;
  engineApiVersion?: unknown;
  consoleVersion?: unknown;
}

interface ActiveRuntime {
  version: string;
  pinned?: boolean;
}

export function consoleRuntimeStoreRoot(home: string = sugoHomeDir()): string {
  return join(home, ".sugo", "runtime", "console");
}

function runtimeDescriptor(runtimeRoot: string, source: ConsoleRuntimeDescriptor["source"]): ConsoleRuntimeDescriptor | null {
  const entryPath = join(runtimeRoot, "server.mjs");
  const manifestPath = join(runtimeRoot, "runtime.json");
  if (!existsSync(entryPath) || !existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as RuntimeManifest;
    if (
      manifest.runtimeSchemaVersion !== CONSOLE_RUNTIME_SCHEMA_VERSION
      || manifest.engineApiVersion !== CONSOLE_ENGINE_API_VERSION
      || typeof manifest.consoleVersion !== "string"
      || !manifest.consoleVersion.trim()
      || !versionParts(manifest.consoleVersion)
    ) return null;
    return {
      source,
      runtimeRoot,
      entryPath,
      consoleVersion: manifest.consoleVersion,
      buildId: `console-${manifest.consoleVersion}`,
    };
  } catch {
    return null;
  }
}

function readActive(storeRoot: string): ActiveRuntime | null {
  try {
    const value = JSON.parse(readFileSync(join(storeRoot, "active.json"), "utf8")) as ActiveRuntime;
    return typeof value.version === "string" && value.version.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function versionParts(version: string): number[] | null {
  if (!/^\d+\.\d+\.\d+$/.test(version)) return null;
  return version.split(".").map(Number);
}

export function compareConsoleVersions(left: string, right: string): number {
  const a = versionParts(left);
  const b = versionParts(right);
  if (!a || !b) return left.localeCompare(right);
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index]! - b[index]!;
  }
  return 0;
}

export function resolveConsoleRuntime(pluginRoot: string, home: string = sugoHomeDir()): ConsoleRuntimeDescriptor | null {
  const storeRoot = consoleRuntimeStoreRoot(home);
  const active = readActive(storeRoot);
  if (active) {
    const external = runtimeDescriptor(join(storeRoot, active.version), "external");
    if (external) return external;
  }
  return runtimeDescriptor(join(pluginRoot, "dashboard-runtime"), "embedded");
}

async function writeActive(storeRoot: string, active: ActiveRuntime): Promise<void> {
  await mkdir(storeRoot, { recursive: true });
  await atomicWriteFile(join(storeRoot, "active.json"), `${JSON.stringify(active)}\n`);
}

export async function installConsoleRuntime(runtimeRoot: string, home: string = sugoHomeDir(), pinned = false): Promise<ConsoleRuntimeDescriptor | null> {
  const source = runtimeDescriptor(runtimeRoot, "external");
  if (!source) return null;
  const storeRoot = consoleRuntimeStoreRoot(home);
  return withFileLock(join(storeRoot, ".runtime.lock"), async () => {
    const target = join(storeRoot, source.consoleVersion);
    if (existsSync(target) && !runtimeDescriptor(target, "external")) {
      await rm(target, { recursive: true, force: true });
    }
    if (!existsSync(target)) {
      await mkdir(dirname(target), { recursive: true });
      const temporary = join(storeRoot, `.install-${basename(target)}-${process.pid}-${Date.now()}`);
      await cp(runtimeRoot, temporary, { recursive: true, errorOnExist: true });
      try { await rename(temporary, target); }
      catch (error) {
        await rm(temporary, { recursive: true, force: true });
        if (!existsSync(target)) throw error;
      }
    }
    const installed = runtimeDescriptor(target, "external");
    if (!installed) return null;
    await writeActive(storeRoot, { version: installed.consoleVersion, pinned });
    return installed;
  });
}

export async function prepareConsoleRuntime(pluginRoot: string, home: string = sugoHomeDir()): Promise<ConsoleRuntimeDescriptor | null> {
  const storeRoot = consoleRuntimeStoreRoot(home);
  const active = readActive(storeRoot);
  const selected = active ? runtimeDescriptor(join(storeRoot, active.version), "external") : null;
  const embeddedRoot = join(pluginRoot, "dashboard-runtime");
  const embedded = runtimeDescriptor(embeddedRoot, "embedded");
  if (!embedded) return selected ?? null;
  if (selected && (active?.pinned || compareConsoleVersions(selected.consoleVersion, embedded.consoleVersion) >= 0)) return selected;
  return installConsoleRuntime(embeddedRoot, home);
}

export function listInstalledConsoleRuntimes(home: string = sugoHomeDir()): ConsoleRuntimeDescriptor[] {
  const storeRoot = consoleRuntimeStoreRoot(home);
  if (!existsSync(storeRoot)) return [];
  return readdirSync(storeRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .map((entry) => runtimeDescriptor(join(storeRoot, entry.name), "external"))
    .filter((entry): entry is ConsoleRuntimeDescriptor => entry !== null)
    .sort((left, right) => compareConsoleVersions(right.consoleVersion, left.consoleVersion));
}

export async function rollbackConsoleRuntime(home: string = sugoHomeDir()): Promise<ConsoleRuntimeDescriptor | null> {
  const storeRoot = consoleRuntimeStoreRoot(home);
  return withFileLock(join(storeRoot, ".runtime.lock"), async () => {
    const active = readActive(storeRoot);
    const installed = listInstalledConsoleRuntimes(home);
    const target = active
      ? installed.find((runtime) => compareConsoleVersions(runtime.consoleVersion, active.version) < 0)
      : installed[1];
    if (!target) return null;
    await writeActive(storeRoot, { version: target.consoleVersion, pinned: true });
    return target;
  });
}

export async function updateConsoleRuntime(pluginRoot: string, home: string = sugoHomeDir()): Promise<ConsoleRuntimeDescriptor | null> {
  const embedded = runtimeDescriptor(join(pluginRoot, "dashboard-runtime"), "embedded");
  const installed = listInstalledConsoleRuntimes(home);
  const latest = [embedded, ...installed]
    .filter((runtime): runtime is ConsoleRuntimeDescriptor => runtime !== null)
    .sort((left, right) => compareConsoleVersions(right.consoleVersion, left.consoleVersion))[0];
  if (!latest) return null;
  if (latest.source === "embedded") return installConsoleRuntime(latest.runtimeRoot, home);
  const storeRoot = consoleRuntimeStoreRoot(home);
  return withFileLock(join(storeRoot, ".runtime.lock"), async () => {
    await writeActive(storeRoot, { version: latest.consoleVersion, pinned: false });
    return latest;
  });
}
