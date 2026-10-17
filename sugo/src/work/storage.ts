import { join } from "node:path";
import { sugoHomeDir } from "../homeDir.js";

/** 저장 레이아웃: `~/.claude/sugo/work/<workspace>/`. */
export function workRootDir(): string {
  return join(sugoHomeDir(), ".claude", "sugo", "work");
}


export function workspaceDir(workspace: string): string {
  return join(workRootDir(), workspace);
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

/** 대시보드 sync 재시도 큐 — 워크스페이스 단위가 아니라 작업 루트에 하나만 둔다. */
export function syncRetryQueuePath(): string {
  return join(workRootDir(), "sync-retry-queue.json");
}

export function syncRetryQueueLockPath(): string {
  return `${syncRetryQueuePath()}.lock`;
}
