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
    const normalizedEntry = { ...entry, path: normalizedPath };
    const existing = current.find((e) => resolve(e.path) === normalizedPath);
    if (existing && JSON.stringify(existing) === JSON.stringify(normalizedEntry)) return;
    const filtered = current.filter((e) => resolve(e.path) !== normalizedPath);
    filtered.push(normalizedEntry);
    await atomicWriteFile(path, JSON.stringify(filtered, null, 2));
  });
}

/**
 * sugo_delete(§9 라이프사이클): 레지스트리에서만 제거한다 — 프로젝트의 실제 파일(sugo/**)은
 * 건드리지 않는다. "삭제"가 사용자 프로젝트 파일을 지우는 것으로 오해되면 위험하므로, 이 도구는
 * "sugo가 이 프로젝트 추적을 그만둔다"는 제어-평면 동작으로만 스코프를 좁혔다(파일은 사용자가
 * 알아서 정리하거나 재등록 시 그대로 재사용된다).
 */
export async function unregisterProject(projectPath: string): Promise<boolean> {
  const normalizedPath = resolve(projectPath);
  return withFileLock(registryLockPath(), async () => {
    const current = await readRegistryFile();
    const filtered = current.filter((e) => resolve(e.path) !== normalizedPath);
    if (filtered.length === current.length) return false;
    await atomicWriteFile(registryPath(), JSON.stringify(filtered, null, 2));
    return true;
  });
}
