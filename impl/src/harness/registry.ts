import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { atomicWriteFile, withFileLock } from "../fsUtil.js";
import { sugoHomeDir } from "../homeDir.js";

export interface RegistryEntry {
  path: string;
  name: string;
  registeredAt: string;
  workspace?: string;
}

export function registryPath(): string {
  return join(sugoHomeDir(), ".claude", "sugo", "registry.json");
}

function registryLockPath(): string {
  return `${registryPath()}.lock`;
}

async function readRegistryFile(): Promise<RegistryEntry[]> {
  try {
    const raw = await readFile(registryPath(), "utf-8");
    return JSON.parse(raw) as RegistryEntry[];
  } catch {
    return [];
  }
}

export async function loadRegistry(): Promise<RegistryEntry[]> {
  return readRegistryFile();
}

export async function findRegistryEntry(projectPath: string): Promise<RegistryEntry | null> {
  const normalized = resolve(projectPath);
  const entries = await readRegistryFile();
  return entries.find((e) => resolve(e.path) === normalized) ?? null;
}

/**
 * 레지스트리는 여러 sugo_add 호출이 동시에 건드릴 수 있는 공유 파일이라 wx 락으로 race를 막는다(§D.3).
 * 같은 projectPath로 재등록하면 기존 엔트리를 갱신(중복 추가하지 않음).
 */
export async function registerProject(entry: RegistryEntry): Promise<void> {
  const path = registryPath();
  await mkdir(dirname(path), { recursive: true });
  const normalizedPath = resolve(entry.path);

  await withFileLock(registryLockPath(), async () => {
    const current = await readRegistryFile();
    const filtered = current.filter((e) => resolve(e.path) !== normalizedPath);
    filtered.push({ ...entry, path: normalizedPath });
    await atomicWriteFile(path, JSON.stringify(filtered, null, 2));
  });
}
