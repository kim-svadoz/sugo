import { mkdir, readFile } from "node:fs/promises";
import { atomicWriteFile, withFileLock } from "../fsUtil.js";
import { syncRetryQueueLockPath, syncRetryQueuePath } from "../hulk/storage.js";
import { dirname } from "node:path";

export const MAX_RETRY_QUEUE_ITEMS = 100;
export const MAX_RETRY_ATTEMPTS = 5;

export interface RetryItem {
  endpoint: string;
  method: "POST" | "DELETE";
  data: unknown;
  timestamp: string;
  retryCount: number;
}

interface RetryQueueFile {
  items: RetryItem[];
}

async function readQueueFile(): Promise<RetryQueueFile> {
  try {
    const raw = await readFile(syncRetryQueuePath(), "utf-8");
    return JSON.parse(raw) as RetryQueueFile;
  } catch {
    return { items: [] };
  }
}

async function writeQueueFile(file: RetryQueueFile): Promise<void> {
  await mkdir(dirname(syncRetryQueuePath()), { recursive: true });
  await atomicWriteFile(syncRetryQueuePath(), JSON.stringify(file, null, 2));
}

/** §7.2: 실패한 이벤트를 큐에 쌓는다. 최대 100항목 — 넘치면 가장 오래된 것부터 버린다(무한 축적 방지). */
export async function enqueueRetry(endpoint: string, method: "POST" | "DELETE", data: unknown): Promise<void> {
  await withFileLock(syncRetryQueueLockPath(), async () => {
    const file = await readQueueFile();
    file.items.push({ endpoint, method, data, timestamp: new Date().toISOString(), retryCount: 0 });
    if (file.items.length > MAX_RETRY_QUEUE_ITEMS) {
      file.items = file.items.slice(file.items.length - MAX_RETRY_QUEUE_ITEMS);
    }
    await writeQueueFile(file);
  });
}

export async function listRetryQueue(): Promise<RetryItem[]> {
  const file = await readQueueFile();
  return file.items;
}

/** 재전송을 시도한다. attempt(item)이 true(성공)면 큐에서 제거, false(실패)면 retryCount를 올리고
 * MAX_RETRY_ATTEMPTS를 넘긴 항목은 버린다(교착 방지 — 죽은 엔드포인트가 큐를 영원히 채우지 않게). */
export async function processRetryQueue(attempt: (item: RetryItem) => Promise<boolean>): Promise<void> {
  await withFileLock(syncRetryQueueLockPath(), async () => {
    const file = await readQueueFile();
    const remaining: RetryItem[] = [];
    for (const item of file.items) {
      const succeeded = await attempt(item);
      if (succeeded) continue;
      const retried = { ...item, retryCount: item.retryCount + 1 };
      if (retried.retryCount < MAX_RETRY_ATTEMPTS) remaining.push(retried);
    }
    await writeQueueFile({ items: remaining });
  });
}
