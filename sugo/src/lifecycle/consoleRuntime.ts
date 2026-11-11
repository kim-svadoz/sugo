import { existsSync, readFileSync, readdirSync } from "node:fs";
import { cp, mkdir, rename, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { sugoHomeDir } from "../homeDir.js";
import { atomicWriteFile, withFileLock } from "../fsUtil.js";
import { extractConsoleRuntimeArchive, type ConsoleRuntimeRelease, verifySha256 } from "./consoleRuntimeArchive.js";

export const CONSOLE_RUNTIME_SCHEMA_VERSION = 1;
export const CONSOLE_ENGINE_API_VERSION = 1;
export const DEFAULT_CONSOLE_RUNTIME_MANIFEST_URL = "https://github.com/kim-svadoz/sugo/releases/download/console-latest/console-runtime.json";

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

const AUTO_UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1_000;
const MAX_RUNTIME_ARCHIVE_BYTES = 100 * 1024 * 1024;

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

function recentlyChecked(storeRoot: string, now = Date.now()): boolean {
  try {
    const value = JSON.parse(readFileSync(join(storeRoot, "update-check.json"), "utf8")) as { checkedAt?: unknown };
    return typeof value.checkedAt === "number" && now - value.checkedAt >= 0 && now - value.checkedAt < AUTO_UPDATE_INTERVAL_MS;
  } catch {
    return false;
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

function validRelease(value: unknown): value is ConsoleRuntimeRelease {
  if (!value || typeof value !== "object") return false;
  const release = value as Partial<ConsoleRuntimeRelease>;
  return release.runtimeSchemaVersion === CONSOLE_RUNTIME_SCHEMA_VERSION
    && release.engineApiVersion === CONSOLE_ENGINE_API_VERSION
    && typeof release.consoleVersion === "string" && versionParts(release.consoleVersion) !== null
    && typeof release.archiveUrl === "string" && /^https?:\/\//.test(release.archiveUrl)
    && typeof release.sha256 === "string" && /^[a-f0-9]{64}$/i.test(release.sha256);
}

async function fetchWithTimeout(url: string, timeoutMs = 5_000): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(timeoutMs), redirect: "follow" });
}

export async function fetchConsoleRuntimeRelease(manifestUrl = process.env.SUGO_CONSOLE_RUNTIME_MANIFEST_URL || DEFAULT_CONSOLE_RUNTIME_MANIFEST_URL): Promise<ConsoleRuntimeRelease | null> {
  try {
    const response = await fetchWithTimeout(manifestUrl);
    if (!response.ok) return null;
    const release: unknown = await response.json();
    return validRelease(release) ? release : null;
  } catch {
    return null;
  }
}

export async function downloadConsoleRuntime(release: ConsoleRuntimeRelease, home: string = sugoHomeDir()): Promise<ConsoleRuntimeDescriptor | null> {
  if (!validRelease(release)) return null;
  const storeRoot = consoleRuntimeStoreRoot(home);
  return withFileLock(join(storeRoot, ".runtime.lock"), async () => {
    const target = join(storeRoot, release.consoleVersion);
    const existing = runtimeDescriptor(target, "external");
    if (existing) {
      await writeActive(storeRoot, { version: existing.consoleVersion, pinned: false });
      return existing;
    }
    let archive: Uint8Array;
    try {
      const response = await fetchWithTimeout(release.archiveUrl, 30_000);
      if (!response.ok) return null;
      const contentLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(contentLength) && contentLength > MAX_RUNTIME_ARCHIVE_BYTES) return null;
      archive = new Uint8Array(await response.arrayBuffer());
    } catch {
      return null;
    }
    if (archive.byteLength > MAX_RUNTIME_ARCHIVE_BYTES || !verifySha256(archive, release.sha256)) return null;
    const temporary = join(storeRoot, `.download-${release.consoleVersion}-${process.pid}-${Date.now()}`);
    await mkdir(storeRoot, { recursive: true });
    try {
      await extractConsoleRuntimeArchive(archive, temporary);
      const unpacked = runtimeDescriptor(temporary, "external");
      if (!unpacked || unpacked.consoleVersion !== release.consoleVersion) return null;
      if (existsSync(target)) await rm(target, { recursive: true, force: true });
      await rename(temporary, target);
      const installed = runtimeDescriptor(target, "external");
      if (!installed) return null;
      await writeActive(storeRoot, { version: installed.consoleVersion, pinned: false });
      return installed;
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
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
  if (selected && active?.pinned) return selected;
  const embedded = runtimeDescriptor(join(pluginRoot, "dashboard-runtime"), "embedded");
  if (embedded && (!selected || compareConsoleVersions(embedded.consoleVersion, selected.consoleVersion) > 0)) {
    const installed = await installConsoleRuntime(embedded.runtimeRoot, home);
    if (installed) await atomicWriteFile(join(storeRoot, "update-check.json"), `${JSON.stringify({ checkedAt: Date.now() })}\n`);
    return installed;
  }
  if (selected && recentlyChecked(storeRoot)) return selected;
  const release = await fetchConsoleRuntimeRelease();
  if (selected) await atomicWriteFile(join(storeRoot, "update-check.json"), `${JSON.stringify({ checkedAt: Date.now() })}\n`);
  if (release && (!selected || compareConsoleVersions(release.consoleVersion, selected.consoleVersion) > 0)) {
    const downloaded = await downloadConsoleRuntime(release, home);
    if (downloaded) {
      await atomicWriteFile(join(storeRoot, "update-check.json"), `${JSON.stringify({ checkedAt: Date.now() })}\n`);
      return downloaded;
    }
  }
  // Phase 3 이후 신규 배포본에는 없지만, 구버전 플러그인과 개발 환경의 이행을 위해 읽기 호환만 유지한다.
  return selected ?? embedded;
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
  const release = await fetchConsoleRuntimeRelease();
  if (release) {
    const downloaded = await downloadConsoleRuntime(release, home);
    if (downloaded) return downloaded;
  }
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
