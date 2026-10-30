import { readFile, unlink } from "node:fs/promises";
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

export async function setHarnessFeatureEnabled(enabled: boolean): Promise<{ enabled: boolean; projectCount: number }> {
  await saveHarnessFeatureState({ enabled });
  const projects = await loadRegistry();
  if (enabled) {
    const { syncProjectHarness } = await import("./sync.js");
    for (const project of projects) {
      await syncProjectHarness({ projectPath: project.path, workspace: project.workspace });
    }
  } else {
    for (const project of projects) await suspendProjectHarness(project.path);
  }
  return { enabled, projectCount: projects.length };
}
