import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "../fsUtil.js";
import { loadProjectConfig, projectSugoDir, saveProjectConfig } from "./config.js";

export class ResetProjectError extends Error {
  constructor(
    public readonly code: "PROJECT_NOT_REGISTERED",
    message: string,
  ) {
    super(message);
  }
}

function backupTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const RESET_CLAUDE_MD = [
  "# Sugo 하네스 인덱스",
  "",
  "(초기화됨 — 하네스가 적용되지 않은 상태입니다. `sugo_add` 또는 `sugo_update`로 다시 적용하세요.)",
  "",
].join("\n");

/**
 * sugo_reset: 적용된 하네스 산출물(sugo/harness/**, CLAUDE.md 내용)만 지운다 —
 * 레지스트리 등록·detectedStack(뭘 감지했는지)은 건드리지 않는다("등록 취소"가 아니라 "적용
 * 되돌리기"). 기존 CLAUDE.md는 sugo/backup/으로 백업해둔다 — 되돌릴 수 없는 손실을 만들지 않기
 * 위한 최소 안전장치다.
 */
export async function resetProjectHarness(projectPath: string): Promise<{ backedUpTo?: string }> {
  const config = await loadProjectConfig(projectPath);
  if (!config) {
    throw new ResetProjectError("PROJECT_NOT_REGISTERED", `등록된 프로젝트가 아닙니다(sugo/config.json 없음): ${projectPath}`);
  }

  const sugoDir = projectSugoDir(projectPath);
  const claudeMdPath = join(sugoDir, "CLAUDE.md");
  let backedUpTo: string | undefined;
  try {
    const current = await readFile(claudeMdPath, "utf-8");
    const backupDir = join(sugoDir, "backup");
    await mkdir(backupDir, { recursive: true });
    backedUpTo = join(backupDir, `CLAUDE.md.${backupTimestamp()}.bak`);
    await atomicWriteFile(backedUpTo, current);
  } catch {
    // CLAUDE.md가 아예 없으면 백업할 것도 없다 — 조용히 진행.
  }

  await rm(join(sugoDir, "harness"), { recursive: true, force: true });
  await atomicWriteFile(claudeMdPath, RESET_CLAUDE_MD);

  await saveProjectConfig({ ...config, appliedHarnesses: [], lastUpdated: new Date().toISOString() });

  return { backedUpTo };
}
