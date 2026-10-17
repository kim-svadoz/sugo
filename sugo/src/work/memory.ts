import { mkdir, readFile } from "node:fs/promises";
import { atomicWriteFile } from "../fsUtil.js";
import { memoryFilePath, workspaceDir } from "./storage.js";

/** work/<ws>/memory.md — "기억해" 명령으로 누적되는 자유 메모(§8) */
export async function appendMemory(workspace: string, note: string): Promise<void> {
  const path = memoryFilePath(workspace);
  const existing = await readFile(path, "utf-8").catch(() => "");
  const entry = `## ${new Date().toISOString()}\n\n${note}\n`;
  const next = existing ? `${existing}\n${entry}` : entry;
  await mkdir(workspaceDir(workspace), { recursive: true });
  await atomicWriteFile(path, next);
}

export async function readMemory(workspace: string): Promise<string> {
  return readFile(memoryFilePath(workspace), "utf-8").catch(() => "");
}
