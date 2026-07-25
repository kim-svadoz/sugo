import { randomBytes } from "node:crypto";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "./fsUtil.js";
import { sugoHomeDir } from "./homeDir.js";
import type { PlanSession } from "./types.js";

export function sessionsDir(): string {
  return join(sugoHomeDir(), ".claude", "sugo", "sessions");
}

export function generateSessionId(): string {
  return `plan-${Date.now()}-${randomBytes(4).toString("hex")}`;
}

function sessionFilePath(id: string): string {
  return join(sessionsDir(), `${id}.json`);
}

export async function saveSession(session: PlanSession): Promise<void> {
  await mkdir(sessionsDir(), { recursive: true });
  session.updatedAt = new Date().toISOString();
  await atomicWriteFile(sessionFilePath(session.id), JSON.stringify(session, null, 2));
}

export async function loadSession(id: string): Promise<PlanSession> {
  const raw = await readFile(sessionFilePath(id), "utf-8");
  return JSON.parse(raw) as PlanSession;
}

export async function sessionExists(id: string): Promise<boolean> {
  try {
    await readFile(sessionFilePath(id), "utf-8");
    return true;
  } catch {
    return false;
  }
}

/** §4.5 판단품질 측정용: 모든 세션 파일을 스캔해 로드한다. 손상된 파일은 조용히 건너뛴다. */
export async function loadAllSessions(): Promise<PlanSession[]> {
  let entries: string[];
  try {
    entries = await readdir(sessionsDir());
  } catch {
    return [];
  }
  const sessions: PlanSession[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(sessionsDir(), name), "utf-8");
      sessions.push(JSON.parse(raw) as PlanSession);
    } catch {
      continue;
    }
  }
  return sessions;
}
