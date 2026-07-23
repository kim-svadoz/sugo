import { z } from "zod";
import { loadProjectConfig } from "../harness/config.js";
import { loadRegistry } from "../harness/registry.js";

export const sugoStatusInputSchema = {};

/** §9 sugo_status: 등록 프로젝트 대시보드(로컬, readOnly) — registry.json + 각 프로젝트의 config.json을 모아 보여준다. */
export async function handleSugoStatus() {
  const entries = await loadRegistry();
  const projects = await Promise.all(
    entries.map(async (entry) => {
      const config = await loadProjectConfig(entry.path);
      return {
        path: entry.path,
        name: entry.name,
        registeredAt: entry.registeredAt,
        workspace: entry.workspace,
        disabled: config?.disabled ?? false,
        appliedHarnessCount: config?.appliedHarnesses.length ?? 0,
        languages: config?.detectedStack.languages.map((l) => l.name) ?? [],
        frameworks: config?.detectedStack.frameworks.map((f) => f.name) ?? [],
        lastUpdated: config?.lastUpdated,
      };
    }),
  );
  const payload = { ok: true, totalProjects: projects.length, projects };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
