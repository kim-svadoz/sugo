import { join } from "node:path";
import { sugoHomeDir } from "../homeDir.js";

/** 저장 레이아웃(§1): ~/.claude/sugo/hulk/<workspace>/ */
export function hulkRootDir(): string {
  return join(sugoHomeDir(), ".claude", "sugo", "hulk");
}

export function workspaceDir(workspace: string): string {
  return join(hulkRootDir(), workspace);
}

export function workspaceFilePath(workspace: string): string {
  return join(workspaceDir(workspace), "workspace.json");
}

export function tasksFilePath(workspace: string): string {
  return join(workspaceDir(workspace), "tasks.json");
}

export function tasksLockPath(workspace: string): string {
  return `${tasksFilePath(workspace)}.lock`;
}

export function checkpointsDir(workspace: string): string {
  return join(workspaceDir(workspace), "checkpoints");
}

export function specsDir(workspace: string): string {
  return join(workspaceDir(workspace), "specs");
}

export function historyDir(workspace: string): string {
  return join(workspaceDir(workspace), "history");
}

export function memoryFilePath(workspace: string): string {
  return join(workspaceDir(workspace), "memory.md");
}

export function roadmapFilePath(workspace: string): string {
  return join(workspaceDir(workspace), "roadmap.json");
}

export function roadmapLockPath(workspace: string): string {
  return `${roadmapFilePath(workspace)}.lock`;
}
