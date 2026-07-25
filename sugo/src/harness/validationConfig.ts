import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { load } from "js-yaml";
import { loadProjectConfig } from "./config.js";

export type CheckSeverity = "error" | "warning";

export interface ValidationCheck {
  id: string;
  description: string;
  severity: CheckSeverity;
}

export interface HarnessValidationConfig {
  harnessId: string;
  checks: ValidationCheck[];
}

interface RawValidationYaml {
  harnessId?: string;
  checks?: { id?: string; description?: string; severity?: string }[];
}

export function parseValidationYaml(content: string): HarnessValidationConfig {
  const raw = load(content) as RawValidationYaml | null;
  const checks: ValidationCheck[] = (raw?.checks ?? [])
    .filter((c): c is { id: string; description: string; severity: string } => !!c?.id)
    .map((c) => ({
      id: c.id,
      description: c.description ?? "",
      severity: c.severity === "error" ? "error" : "warning",
    }));
  return { harnessId: raw?.harnessId ?? "unknown", checks };
}

/** 프로젝트에 적용된 하네스들의 validation.yaml을 실제로 읽어 harnessId -> config로 맵을 만든다. */
export async function loadProjectValidationConfigs(projectPath: string): Promise<Map<string, HarnessValidationConfig>> {
  const config = await loadProjectConfig(projectPath);
  const result = new Map<string, HarnessValidationConfig>();
  if (!config) return result;

  for (const applied of config.appliedHarnesses) {
    const path = join(projectPath, "sugo", "harness", applied.id, "validation.yaml");
    try {
      const content = await readFile(path, "utf-8");
      result.set(applied.id, parseValidationYaml(content));
    } catch {
      continue;
    }
  }
  return result;
}
