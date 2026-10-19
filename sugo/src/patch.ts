import { realpath, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { runGit } from "./prRefs.js";

export interface PatchContext {
  parentPrdPath: string;
  version: number;
  baseWorkResultPath: string;
  featureDir: string;
}

export class PatchEntryError extends Error {
  constructor(
    public readonly code: "PATCH_FEATURE_DIR_NOT_FOUND" | "PATCH_PARENT_PRD_NOT_FOUND" | "PATCH_WORK_RESULT_NOT_FOUND" | "PATCH_WORK_RESULT_INVALID" | "PATCH_PROJECT_MISMATCH",
    message: string,
  ) {
    super(message);
  }
}

export interface PostHocBaseline {
  baselineRevision: string;
  headAtCapture: string;
  changedFiles: string[];
  source: "working-tree" | "committed-range" | "mixed";
  capturedAt: string;
}

export class PostHocEntryError extends Error {
  constructor(
    public readonly code: "POST_HOC_GIT_REQUIRED" | "POST_HOC_BASELINE_REQUIRED" | "POST_HOC_BASELINE_INVALID" | "POST_HOC_NO_CHANGES" | "POST_HOC_SCOPE_REQUIRED" | "POST_HOC_SCOPE_INVALID",
    message: string,
  ) {
    super(message);
  }
}

function lines(value: string | null): string[] {
  return value ? value.split("\n").map((line) => line.trim()).filter(Boolean) : [];
}

function normalizeRepoPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "");
}

function selectConfirmedFiles(available: string[], requested: string[] | undefined): string[] {
  if (requested === undefined) return available;
  const selected = [...new Set(requested.map(normalizeRepoPath).filter(Boolean))].sort();
  if (selected.length === 0) {
    throw new PostHocEntryError("POST_HOC_SCOPE_REQUIRED", "연결할 변경 파일을 확인한 뒤 명시해야 합니다.");
  }
  const availableSet = new Set(available);
  const invalid = selected.filter((path) => path.startsWith("../") || path.startsWith("/") || !availableSet.has(path));
  if (invalid.length > 0) {
    throw new PostHocEntryError("POST_HOC_SCOPE_INVALID", `현재 Git 변경에 없는 파일은 연결할 수 없습니다: ${invalid.join(", ")}`);
  }
  return selected;
}

export async function capturePostHocBaseline(projectPath: string, requestedBaseRevision?: string, excludedPaths: string[] = [], requestedChangedFiles?: string[]): Promise<PostHocBaseline> {
  const head = await runGit(["rev-parse", "HEAD"], projectPath);
  if (!head || !/^[0-9a-f]{40,64}$/.test(head)) {
    throw new PostHocEntryError("POST_HOC_GIT_REQUIRED", "사후 patch 연결은 Git 저장소와 HEAD가 필요합니다.");
  }
  const excluded = excludedPaths.map((path) => relative(projectPath, path).replace(/\\/g, "/").replace(/\/$/, ""));
  const keep = (path: string) => !excluded.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  const dirtyFiles = [...new Set([
    ...lines(await runGit(["diff", "--name-only", "HEAD"], projectPath)),
    ...lines(await runGit(["ls-files", "--others", "--exclude-standard"], projectPath)),
  ])].filter(keep).sort();
  if (dirtyFiles.length > 0 && !requestedBaseRevision) {
    return { baselineRevision: head, headAtCapture: head, changedFiles: selectConfirmedFiles(dirtyFiles, requestedChangedFiles), source: "working-tree", capturedAt: new Date().toISOString() };
  }
  if (!requestedBaseRevision) {
    throw new PostHocEntryError("POST_HOC_BASELINE_REQUIRED", "이미 커밋된 변경은 변경 전 Git revision을 지정해야 합니다.");
  }
  const base = await runGit(["rev-parse", `${requestedBaseRevision}^{commit}`], projectPath);
  if (!base || !/^[0-9a-f]{40,64}$/.test(base)) {
    throw new PostHocEntryError("POST_HOC_BASELINE_INVALID", "지정한 변경 전 Git revision을 확인할 수 없습니다.");
  }
  const ancestor = await runGit(["merge-base", "--is-ancestor", base, head], projectPath);
  if (ancestor === null) {
    throw new PostHocEntryError("POST_HOC_BASELINE_INVALID", "지정한 revision이 현재 HEAD의 조상이 아닙니다.");
  }
  const committedFiles = lines(await runGit(["diff", "--name-only", `${base}..${head}`], projectPath)).filter(keep);
  const availableFiles = [...new Set([...committedFiles, ...dirtyFiles])].sort();
  const changedFiles = selectConfirmedFiles(availableFiles, requestedChangedFiles);
  if (changedFiles.length === 0) {
    throw new PostHocEntryError("POST_HOC_NO_CHANGES", "지정한 기준선 이후 연결할 변경이 없습니다.");
  }
  return { baselineRevision: base, headAtCapture: head, changedFiles, source: dirtyFiles.length > 0 ? "mixed" : "committed-range", capturedAt: new Date().toISOString() };
}

const PATCH_FILE_RE = /^(prd|work-result)-patch-v(\d+)\.md$/i;
const PRD_PATCH_RE = /^prd-patch-v(\d+)\.md$/i;

/**
 * 순수 함수: 최초 feat는 대시보드 계보의 v0이고, 첫 patch는 v1이다.
 * 디렉터리에서 발견한 (prd|work-result)-patch-v(N).md 중 최대 N의 다음 버전을 정한다.
 */
export function computeNextPatchVersion(filenames: string[]): number {
  let max = 0;
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
 * 둘 다 없으면 진입 불가(PATCH_PARENT_PRD_NOT_FOUND).
 */
export async function resolvePatchContext(workResultPath: string, projectPath?: string): Promise<PatchContext> {
  const resolvedWorkResult = resolve(workResultPath);
  const resultName = basename(resolvedWorkResult);
  if (!/^work-result(?:-patch-v\d+)?\.md$/i.test(resultName)) {
    throw new PatchEntryError("PATCH_WORK_RESULT_INVALID", `정식 work-result 파일만 patch 진입점으로 사용할 수 있습니다: ${workResultPath}`);
  }
  const featureDir = dirname(resolvedWorkResult);
  let filenames: string[];
  try {
    filenames = await readdir(featureDir);
  } catch {
    throw new PatchEntryError("PATCH_FEATURE_DIR_NOT_FOUND", `feature 디렉터리를 찾을 수 없습니다: ${featureDir}`);
  }
  try {
    const entry = await stat(resolvedWorkResult);
    if (!entry.isFile()) throw new Error("not a file");
  } catch {
    throw new PatchEntryError("PATCH_WORK_RESULT_NOT_FOUND", `work-result 파일을 찾을 수 없습니다: ${workResultPath}`);
  }
  if (projectPath) {
    const featuresRoot = await realpath(resolve(projectPath, "sugo", "features")).catch(() => resolve(projectPath, "sugo", "features"));
    const canonicalFeatureDir = await realpath(featureDir).catch(() => featureDir);
    const rel = relative(featuresRoot, canonicalFeatureDir);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || resolve(featuresRoot, rel) !== canonicalFeatureDir) {
      throw new PatchEntryError("PATCH_PROJECT_MISMATCH", `work-result가 대상 프로젝트의 sugo/features에 속하지 않습니다: ${workResultPath}`);
    }
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

  return { parentPrdPath, version, baseWorkResultPath: resolvedWorkResult, featureDir };
}
