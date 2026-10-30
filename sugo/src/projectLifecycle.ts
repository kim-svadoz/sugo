import { access, readdir, readFile, rm, rmdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { atomicWriteFile } from "./fsUtil.js";
import { loadProjectConfig } from "./harness/config.js";
import { loadInstallManifest } from "./harness/installManifest.js";
import { findRegistryEntry, unregisterProject } from "./harness/registry.js";
import { buildClaudeRuleFile, removeRootAgentsReference, removeRootClaudeReference } from "./harness/rulesFile.js";
import { syncProjectHarness } from "./harness/sync.js";
import { assertProjectDirectory, registerSugoProject } from "./projectRegistration.js";
import { removeProjectFromWorkspaces } from "./work/workspace.js";

const SUGO_LOADING_FILES = ["sugo/harness", "sugo/config.json", "sugo/CLAUDE.md"];

function lifecycleError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

const exists = (path: string) => access(path).then(() => true, () => false);

async function stripRootBlock(path: string, strip: (content: string | null) => { content: string; changed: boolean }): Promise<boolean> {
  const current = await readFile(path, "utf8").catch(() => null);
  if (current === null) return false;
  const next = strip(current);
  if (!next.changed) return false;
  if (next.content.trim() === "") await rm(path, { force: true });
  else await atomicWriteFile(path, next.content);
  return true;
}

async function removeIfEmpty(path: string): Promise<void> {
  const entries = await readdir(path).catch(() => null);
  if (entries && entries.length === 0) await rmdir(path);
}

/** 프로젝트에서 Claude·Codex가 자동으로 읽는 Sugo 파일만 지운다. PRD·스펙·작업 결과는 남긴다. */
export async function detachProjectFiles(projectPath: string): Promise<string[]> {
  const config = await loadProjectConfig(projectPath);
  const manifest = await loadInstallManifest(projectPath);
  const rulePaths = [
    ...(config?.appliedHarnesses ?? []).map((applied) => buildClaudeRuleFile(applied.id, "").relPath),
    ...(manifest?.managedFiles ?? []).filter((rel) => rel.startsWith(".claude/rules/")),
  ];
  const removed: string[] = [];
  for (const rel of new Set([...rulePaths, ...SUGO_LOADING_FILES])) {
    const path = join(projectPath, rel);
    if (!(await exists(path))) continue;
    await rm(path, { recursive: true, force: true });
    removed.push(rel);
  }
  if (await stripRootBlock(join(projectPath, "CLAUDE.md"), removeRootClaudeReference)) removed.push("CLAUDE.md");
  if (await stripRootBlock(join(projectPath, "AGENTS.md"), removeRootAgentsReference)) removed.push("AGENTS.md");

  await removeIfEmpty(join(projectPath, ".claude", "rules", "general"));
  await removeIfEmpty(join(projectPath, ".claude", "rules"));
  await removeIfEmpty(join(projectPath, ".claude"));
  const sugoEntries = await readdir(join(projectPath, "sugo")).catch(() => []);
  if (sugoEntries.length === 1 && sugoEntries[0] === "install-manifest.json") await rm(join(projectPath, "sugo"), { recursive: true, force: true });
  return removed;
}

export async function removeSugoProject(rawPath: string) {
  const projectPath = resolve(rawPath);
  if (!(await findRegistryEntry(projectPath))) throw lifecycleError("PROJECT_NOT_REGISTERED", `등록된 프로젝트가 아닙니다: ${projectPath}`);
  const folderMissing = !(await exists(projectPath));
  const removedFiles = folderMissing ? [] : await detachProjectFiles(projectPath);
  await unregisterProject(projectPath);
  const workspaces = await removeProjectFromWorkspaces(projectPath);
  return { ok: true as const, projectPath, folderMissing, removedFiles, workspaces };
}

export async function moveSugoProject(input: { from: string; to: string }) {
  const from = resolve(input.from);
  const to = resolve(input.to);
  const entry = await findRegistryEntry(from);
  if (!entry) throw lifecycleError("PROJECT_NOT_REGISTERED", `등록된 프로젝트가 아닙니다: ${from}`);
  if (await findRegistryEntry(to)) throw lifecycleError("PROJECT_ALREADY_REGISTERED", "이미 등록된 경로입니다.");
  await assertProjectDirectory(to);

  if (entry.workspace) await registerSugoProject({ projectPath: to, workspace: entry.workspace });
  else await syncProjectHarness({ projectPath: to });
  const removed = await removeSugoProject(from);
  return { ok: true as const, from, to, workspace: entry.workspace ?? null, removedFiles: removed.removedFiles };
}
