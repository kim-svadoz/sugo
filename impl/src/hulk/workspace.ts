import { mkdir, readdir, readFile } from "node:fs/promises";
import { atomicWriteFile } from "../fsUtil.js";
import { hulkRootDir, workspaceDir, workspaceFilePath } from "./storage.js";
import type { Workspace } from "./types.js";

export async function loadWorkspace(name: string): Promise<Workspace | null> {
  try {
    const raw = await readFile(workspaceFilePath(name), "utf-8");
    return JSON.parse(raw) as Workspace;
  } catch {
    return null;
  }
}

/** 없으면 생성, 있으면 projects를 병합(중복 제거)한다. */
export async function ensureWorkspace(name: string, projectPath?: string): Promise<Workspace> {
  const existing = await loadWorkspace(name);
  const projects = new Set(existing?.projects ?? []);
  if (projectPath) projects.add(projectPath);
  const workspace: Workspace = {
    name,
    projects: Array.from(projects),
    created_at: existing?.created_at ?? new Date().toISOString(),
  };
  await mkdir(workspaceDir(name), { recursive: true });
  await atomicWriteFile(workspaceFilePath(name), JSON.stringify(workspace, null, 2));
  return workspace;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  let entries;
  try {
    entries = await readdir(hulkRootDir(), { withFileTypes: true });
  } catch {
    return [];
  }
  const workspaces: Workspace[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const ws = await loadWorkspace(entry.name);
    if (ws) workspaces.push(ws);
  }
  return workspaces;
}
