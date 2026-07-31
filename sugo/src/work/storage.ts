import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { sugoHomeDir } from "../homeDir.js";

/** 저장 레이아웃(§1/§9): `~/.claude/sugo/work/<workspace>/` — 구 `hulk/`에서 리네임됨. */
export function workRootDir(): string {
  return join(sugoHomeDir(), ".claude", "sugo", "work");
}

/** 마이그레이션 원본으로만 쓰는 구 경로. 새 코드가 여기에 쓰면 안 된다. */
export function legacyHulkRootDir(): string {
  return join(sugoHomeDir(), ".claude", "sugo", "hulk");
}

const MIGRATION_MARKER = ".hulk-migrated";

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

/** §8.2 대시보드 sync 재시도 큐 — 워크스페이스 단위가 아니라 WORK 루트에 하나만 둔다(§1 레이아웃). */
export function syncRetryQueuePath(): string {
  return join(workRootDir(), "sync-retry-queue.json");
}

export function syncRetryQueueLockPath(): string {
  return `${syncRetryQueuePath()}.lock`;
}

// ── §9 WORK 리네임 마이그레이션 ──────────────────────────────────────────────

export interface WorkMigrationResult {
  migrated: boolean;
  alreadyMigrated: boolean;
  copied: number;
  skipped: number;
  failures: number;
}

async function listFilesRecursively(dir: string, base = dir, acc: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await listFilesRecursively(full, base, acc);
    else acc.push(relative(base, full));
  }
  return acc;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (err) {
    // 디렉터리면 EISDIR로 던지지만 "존재한다"가 맞다.
    return (err as NodeJS.ErrnoException).code === "EISDIR";
  }
}

/**
 * 구 `hulk/` 데이터를 `work/`로 **복사 병합**한다. 부팅 시 1회 호출한다.
 *
 * 안전측 설계 — 옮기는 대상이 사용자의 누적된 실제 작업 원장(태스크·이력·체크포인트·로드맵)이라
 * 한 번 잘못 덮으면 되돌릴 방법이 없다:
 * - **copy이지 move가 아니다.** 구 데이터를 지우지 않아 언제든 롤백 가능하다.
 * - **no-clobber.** work/에 같은 경로가 이미 있으면 건너뛴다. 새 데이터가 항상 이긴다 —
 *   구 경로에 남아 있는 건 정의상 더 오래된 것이다.
 * - **failures==0일 때만 마커를 남긴다.** 한 건이라도 실패하면 마커가 없어 다음 부팅에 재시도한다.
 *   여기서 마커를 남기면 못 옮긴 파일이 영영 방치된다.
 * - 마커가 있으면 즉시 반환한다(재스캔 없음). 마이그레이션은 1회성이고, 그 뒤 구 경로에 쓰는 건
 *   낡은 클라이언트라 끌어올 이유가 없다.
 *
 * 절대 던지지 않는다 — 마이그레이션 실패가 플러그인 기동을 막으면 안 된다.
 */
export async function migrateWorkDataDir(): Promise<WorkMigrationResult> {
  const empty: WorkMigrationResult = { migrated: false, alreadyMigrated: false, copied: 0, skipped: 0, failures: 0 };
  const workRoot = workRootDir();
  const legacyRoot = legacyHulkRootDir();

  try {
    if (await fileExists(join(workRoot, MIGRATION_MARKER))) {
      return { ...empty, alreadyMigrated: true };
    }

    const legacyFiles = await listFilesRecursively(legacyRoot);
    if (legacyFiles.length === 0) {
      // 구 디렉터리 자체가 없으면 신규 설치다 — 마커도 남기지 않는다(나중에 구 데이터가
      // 딸려 들어올 수 있으니 문을 닫아두지 않는다). 있는데 비어 있으면 마커를 남긴다.
      try {
        await readdir(legacyRoot);
      } catch {
        return empty;
      }
    }

    let copied = 0;
    let skipped = 0;
    let failures = 0;

    for (const rel of legacyFiles) {
      const target = join(workRoot, rel);
      try {
        if (await fileExists(target)) {
          skipped++;
          continue;
        }
        await mkdir(join(target, ".."), { recursive: true });
        await copyFile(join(legacyRoot, rel), target);
        copied++;
      } catch {
        failures++;
      }
    }

    if (failures === 0) {
      await mkdir(workRoot, { recursive: true });
      await writeFile(
        join(workRoot, MIGRATION_MARKER),
        JSON.stringify({ migratedAt: new Date().toISOString(), copied, skipped, failures }, null, 2),
      );
      return { migrated: true, alreadyMigrated: false, copied, skipped, failures };
    }
    return { migrated: false, alreadyMigrated: false, copied, skipped, failures };
  } catch {
    return empty;
  }
}
