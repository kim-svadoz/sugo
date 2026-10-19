import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "../fsUtil.js";
import { syncHistory } from "../dashboard/sync.js";
import { historyDir } from "./storage.js";
import type { WorkLog } from "./types.js";

function generateWorkLogId(): string {
  return `wl-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

/** work/<ws>/history/<id>.json — 완료 작업 요약·결정·변경파일·커밋 + 생산성 지표 */
export async function addWorkLog(workspace: string, params: Omit<WorkLog, "id">): Promise<WorkLog> {
  const workLog: WorkLog = { id: generateWorkLogId(), ...params };
  const dir = historyDir(workspace);
  await mkdir(dir, { recursive: true });
  await atomicWriteFile(join(dir, `${workLog.id}.json`), JSON.stringify(workLog, null, 2));
  void syncHistory(workspace, workLog, workLog.prRefs);
  return workLog;
}

export async function listWorkLogs(workspace: string): Promise<WorkLog[]> {
  const dir = historyDir(workspace);
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const logs: WorkLog[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(dir, name), "utf-8");
      logs.push(JSON.parse(raw) as WorkLog);
    } catch {
      continue;
    }
  }
  return logs.sort((a, b) => a.completed_at.localeCompare(b.completed_at));
}

export async function getWorkLog(workspace: string, id: string): Promise<WorkLog | null> {
  try {
    const raw = await readFile(join(historyDir(workspace), `${id}.json`), "utf-8");
    return JSON.parse(raw) as WorkLog;
  } catch {
    return null;
  }
}
