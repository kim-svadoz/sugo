import { access, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { atomicWriteFile } from "../fsUtil.js";
import { loadProjectConfig } from "./config.js";
import { loadRegistry } from "./registry.js";
import { buildClaudeRuleFile, removeRootClaudeReference } from "./rulesFile.js";
import { saveHarnessFeatureState } from "./featureState.js";

export async function suspendProjectHarness(projectPath: string): Promise<void> {
  const config = await loadProjectConfig(projectPath);
  for (const applied of config?.appliedHarnesses ?? []) {
    await unlink(join(projectPath, buildClaudeRuleFile(applied.id, "").relPath)).catch(() => {});
  }
  const rootPath = join(projectPath, "CLAUDE.md");
  const current = await readFile(rootPath, "utf8").catch(() => null);
  const next = removeRootClaudeReference(current);
  if (next.changed) await atomicWriteFile(rootPath, next.content);
}

export async function setHarnessFeatureEnabled(enabled: boolean): Promise<{ enabled: boolean; projectCount: number; skippedProjects: string[] }> {
  await saveHarnessFeatureState({ enabled });
  const registered = await loadRegistry();
  // 폴더가 사라진 프로젝트에 규칙을 쓰면 지운 폴더가 다시 생긴다.
  const present = await Promise.all(registered.map((project) => access(project.path).then(() => true, () => false)));
  const projects = registered.filter((_, index) => present[index]);
  const skippedProjects = registered.filter((_, index) => !present[index]).map((project) => project.path);
  if (enabled) {
    const { syncProjectHarness } = await import("./sync.js");
    for (const project of projects) {
      await syncProjectHarness({ projectPath: project.path, workspace: project.workspace });
    }
  } else {
    for (const project of projects) await suspendProjectHarness(project.path);
  }
  return { enabled, projectCount: projects.length, skippedProjects };
}
