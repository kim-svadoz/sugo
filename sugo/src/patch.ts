import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface PatchContext {
  parentPrdPath: string;
  version: number;
  baseWorkResultPath: string;
  featureDir: string;
}

export class PatchEntryError extends Error {
  constructor(
    public readonly code: "PATCH_FEATURE_DIR_NOT_FOUND" | "PATCH_PARENT_PRD_NOT_FOUND",
    message: string,
  ) {
    super(message);
  }
}

const PATCH_FILE_RE = /^(prd|work-result)-patch-v(\d+)\.md$/i;
const PRD_PATCH_RE = /^prd-patch-v(\d+)\.md$/i;

/**
 * 순수 함수(§7): 원본(1차, 번호 없는 prd.md/work-result.md)을 암묵적 v1로 취급하고,
 * 디렉터리에서 발견한 (prd|work-result)-patch-v(N).md 중 최대 N과 비교해 다음 버전을 정한다.
 * 스펙 원문("최대값+1")이 "패치 파일이 하나도 없을 때 기준값"을 명시하지 않아, 원본=v1 기준으로
 * 첫 patch가 v2가 되도록 해석했다 — roadmap-progress.md에 이 해석을 기록해둘 것.
 */
export function computeNextPatchVersion(filenames: string[]): number {
  let max = 1;
  for (const name of filenames) {
    const m = name.match(PATCH_FILE_RE);
    if (m) max = Math.max(max, Number(m[2]));
  }
  return max + 1;
}

/** 순수 함수: PRD-patch-v*.md 중 버전이 가장 큰 파일명을 찾는다(없으면 null). */
export function findLatestPrdPatchFilename(filenames: string[]): string | null {
  let best: { name: string; version: number } | null = null;
  for (const name of filenames) {
    const m = name.match(PRD_PATCH_RE);
    if (!m) continue;
    const version = Number(m[1]);
    if (!best || version > best.version) best = { name, version };
  }
  return best?.name ?? null;
}

export function patchPrdFilename(version: number): string {
  return `PRD-patch-v${version}.md`;
}

export function patchWorkResultFilename(version: number): string {
  return `work-result-patch-v${version}.md`;
}

/**
 * IO: workResultPath(기존 work-result.md 또는 work-result-patch-vN.md)로부터 patch 컨텍스트를
 * 계산한다. 같은 디렉터리의 prd.md를 부모 PRD로 우선하고, 없으면 PRD-patch-v*.md 최신본을 쓴다.
 * 둘 다 없으면 진입 불가(PATCH_PARENT_PRD_NOT_FOUND) — §7.
 */
export async function resolvePatchContext(workResultPath: string): Promise<PatchContext> {
  const featureDir = dirname(workResultPath);
  let filenames: string[];
  try {
    filenames = await readdir(featureDir);
  } catch {
    throw new PatchEntryError("PATCH_FEATURE_DIR_NOT_FOUND", `feature 디렉터리를 찾을 수 없습니다: ${featureDir}`);
  }

  let parentPrdPath: string;
  if (filenames.includes("prd.md")) {
    parentPrdPath = join(featureDir, "prd.md");
  } else {
    const latest = findLatestPrdPatchFilename(filenames);
    if (!latest) {
      throw new PatchEntryError(
        "PATCH_PARENT_PRD_NOT_FOUND",
        `부모 PRD(prd.md 또는 PRD-patch-v*.md)를 찾을 수 없습니다: ${featureDir}`,
      );
    }
    parentPrdPath = join(featureDir, latest);
  }

  const version = computeNextPatchVersion(filenames);

  return { parentPrdPath, version, baseWorkResultPath: workResultPath, featureDir };
}
