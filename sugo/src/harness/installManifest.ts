import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicWriteFile } from "../fsUtil.js";

export interface InstallManifest {
  version: 1;
  projectPath: string;
  sugoDirExisted: boolean;
  rootClaudeOriginal: string | null;
  rootAgentsOriginal: string | null;
  managedFiles: string[];
}

export function installManifestPath(projectPath: string): string {
  return join(projectPath, "sugo", "install-manifest.json");
}

export async function loadInstallManifest(projectPath: string): Promise<InstallManifest | null> {
  return readFile(installManifestPath(projectPath), "utf8")
    .then((raw) => JSON.parse(raw) as InstallManifest, () => null);
}

export async function saveInstallManifest(manifest: InstallManifest): Promise<void> {
  const path = installManifestPath(manifest.projectPath);
  const content = `${JSON.stringify({ ...manifest, managedFiles: [...new Set(manifest.managedFiles)].sort() }, null, 2)}\n`;
  const existing = await readFile(path, "utf8").catch(() => null);
  if (existing === content) return;
  await mkdir(dirname(path), { recursive: true });
  await atomicWriteFile(path, content);
}

export async function recordManagedFile(projectPath: string, relPath: string): Promise<void> {
  const manifest = await loadInstallManifest(projectPath);
  if (!manifest || manifest.managedFiles.includes(relPath)) return;
  manifest.managedFiles.push(relPath);
  await saveInstallManifest(manifest);
}
