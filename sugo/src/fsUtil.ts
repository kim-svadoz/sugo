import { mkdir, open, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

let seq = 0;

/**
 * 임시파일(.tmp.<pid>.<ts>.<seq>) 쓰고 rename으로 교체 — 중단돼도 반쪽 파일이 남지 않는다.
 * Windows에서 AV/인덱서가 핸들을 점유하면 rename이 EPERM/EBUSY로 실패할 수 있어 짧은 백오프 재시도. (§D.3)
 */
export async function atomicWriteFile(path: string, content: string): Promise<void> {
  const tmpPath = `${path}.tmp.${process.pid}.${Date.now()}.${seq++}`;
  await writeFile(tmpPath, content, "utf-8");
  const delays = [0, 25, 50, 100, 200];
  let lastErr: unknown;
  for (const delay of delays) {
    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    try {
      await rename(tmpPath, path);
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  await unlink(tmpPath).catch(() => {});
  throw lastErr;
}

/**
 * `wx` 플래그(존재하면 실패)로 락 파일을 생성해 공유 파일(registry.json 등) 동시쓰기 race를 방지.
 * 락 획득 실패 시 지수 백오프(+지터)로 재시도, 전부 실패하면 예외. fn 실행 후(성공/실패 무관) 락 해제.
 * 지터를 두는 이유: 동시 경쟁자가 여럿이면 고정 지연은 서로 같은 타이밍에 다시 부딪히는
 * thundering herd를 만든다 — 무작위성을 섞어야 경쟁자 수가 늘어도 누군가는 먼저 빠져나간다.
 * 락 파일의 부모 디렉터리가 없으면 open('wx')이 매 시도 ENOENT로 실패해 재시도만 반복하다
 * 타임아웃하는 조용한 실패가 된다 — 그래서 시도 전에 디렉터리를 먼저 보장한다.
 */
// 락을 쥔 프로세스가 강제 종료되면 락 파일이 영원히 남는다. 락 구간은 짧은 파일 작업뿐이라 이보다 오래된 락은 버려진 것으로 본다.
const STALE_LOCK_MS = 30_000;

export async function withFileLock<T>(lockPath: string, fn: () => Promise<T>): Promise<T> {
  await mkdir(dirname(lockPath), { recursive: true });
  const maxAttempts = 40;
  const baseDelayMs = 10;
  const maxDelayMs = 250;
  let acquired = false;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
      const jitter = Math.random() * backoff * 0.5;
      await new Promise((r) => setTimeout(r, backoff + jitter));
    }
    try {
      const handle = await open(lockPath, "wx");
      await handle.close();
      acquired = true;
      break;
    } catch (err) {
      lastErr = err;
      const age = await stat(lockPath).then((s) => Date.now() - s.mtimeMs, () => 0);
      if (age > STALE_LOCK_MS) await unlink(lockPath).catch(() => {});
    }
  }
  if (!acquired) {
    throw new Error(`락 파일을 획득하지 못했습니다: ${lockPath} (${String(lastErr)})`);
  }
  try {
    return await fn();
  } finally {
    await unlink(lockPath).catch(() => {});
  }
}
