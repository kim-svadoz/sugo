import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "./fsUtil.js";
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

/** 저장 레이아웃(§1): <project>/sugo/features/<yyyymmdd>/<feature>/prd.md */
export async function writePrdFile(
  projectPath: string,
  featureName: string,
  content: string,
): Promise<{ featurePath: string; prdPath: string }> {
  const featurePath = join(projectPath, "sugo", "features", todayYyyymmdd(), slugify(featureName));
  const prdPath = join(featurePath, "prd.md");
  await mkdir(featurePath, { recursive: true });
  await atomicWriteFile(prdPath, content);
  return { featurePath, prdPath };
}

/** 저장 레이아웃(§1): <project>/sugo/features/<yyyymmdd>/<feature>/work-result.md */
export async function writeWorkResultFile(featurePath: string, content: string): Promise<{ workResultPath: string }> {
  const workResultPath = join(featurePath, "work-result.md");
  await mkdir(featurePath, { recursive: true });
  await atomicWriteFile(workResultPath, content);
  return { workResultPath };
}

/** §7 Patch: 1차 산출물을 덮어쓰지 않고 featureDir에 PRD-patch-vN.md를 새로 쓴다. */
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

/** §7 Patch: featureDir에 work-result-patch-vN.md를 새로 쓴다. */
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
