import { mkdir, readFile, realpath } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { atomicWriteFile, withFileLock } from "./fsUtil.js";
import { patchPrdFilename, patchWorkResultFilename } from "./patch.js";
import { toNfc } from "./unicodeName.js";

function slugify(name: string): string {
  // NFC 합성 먼저 — 아니면 mac발 조합형 한글이 `가-힣`에 안 걸려 전부 "feature"로 붕괴하고,
  // 서로 다른 기능이 같은 디렉터리를 공유하며 prd.md를 덮어쓴다. 자세한 이유는 unicodeName.ts.
  return toNfc(name).toLowerCase().replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-+|-+$/g, "") || "feature";
}

function todayYyyymmdd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

const planningImageExtensions = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

/** Materialize the inline image links produced by spec-writer before publishing the PRD. */
async function copyPrdImages(specPath: string, featurePath: string, content: string): Promise<void> {
  const names = new Set(Array.from(
    content.matchAll(/!\[[^\]\r\n]*\]\(images\/([a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+)(?=[\s)])/g),
    ([, name]) => name ?? "",
  ).filter((name) => planningImageExtensions.has(extname(name).toLowerCase())));
  if (names.size === 0) return;

  const sourceDir = join(await realpath(dirname(specPath)), "images");
  if (await realpath(sourceDir) !== sourceDir) throw new Error("SPEC images directory must be beside spec.md");
  const targetDir = join(await realpath(featurePath), "images");
  await mkdir(targetDir, { recursive: true });
  if (await realpath(targetDir) !== targetDir) throw new Error("PRD images directory must be beside prd.md");

  for (const name of names) {
    const source = join(sourceDir, name);
    if (await realpath(source) !== source) throw new Error(`SPEC image must be a local file: ${name}`);
    const image = await readFile(source);
    const target = join(targetDir, name);
    const existing = await realpath(target).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (existing) {
      if (existing !== target || !(await readFile(target)).equals(image)) throw new Error(`PRD image conflicts with an existing file: ${name}`);
      continue;
    }
    await atomicWriteFile(target, image);
  }
}

/** 저장 레이아웃: <project>/sugo/features/<yyyymmdd>/<feature>/prd.md */
export async function writePrdFile(
  projectPath: string,
  featureName: string,
  content: string,
  specPath?: string,
): Promise<{ featurePath: string; prdPath: string }> {
  const featurePath = join(projectPath, "sugo", "features", todayYyyymmdd(), slugify(featureName));
  const prdPath = join(featurePath, "prd.md");
  await mkdir(featurePath, { recursive: true });
  if (specPath) {
    await withFileLock(`${prdPath}.lock`, async () => {
      await copyPrdImages(specPath, featurePath, content);
      await atomicWriteFile(prdPath, content);
    });
  } else {
    await atomicWriteFile(prdPath, content);
  }
  return { featurePath, prdPath };
}

/** 저장 레이아웃: <project>/sugo/features/<yyyymmdd>/<feature>/work-result.md */
export async function writeWorkResultFile(featurePath: string, content: string): Promise<{ workResultPath: string }> {
  const workResultPath = join(featurePath, "work-result.md");
  await mkdir(featurePath, { recursive: true });
  await atomicWriteFile(workResultPath, content);
  return { workResultPath };
}

/** Patch: 1차 산출물을 덮어쓰지 않고 featureDir에 PRD-patch-vN.md를 새로 쓴다. */
export async function writePatchPrdFile(
  featureDir: string,
  version: number,
  content: string,
): Promise<{ featurePath: string; prdPath: string }> {
  const prdPath = join(featureDir, patchPrdFilename(version));
  await mkdir(featureDir, { recursive: true });
  await atomicWriteFile(prdPath, content);
  return { featurePath: featureDir, prdPath };
}

/** Patch: featureDir에 work-result-patch-vN.md를 새로 쓴다. */
export async function writePatchWorkResultFile(
  featureDir: string,
  version: number,
  content: string,
): Promise<{ workResultPath: string }> {
  const workResultPath = join(featureDir, patchWorkResultFilename(version));
  await mkdir(featureDir, { recursive: true });
  await atomicWriteFile(workResultPath, content);
  return { workResultPath };
}
