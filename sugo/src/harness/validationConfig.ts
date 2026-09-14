import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { load } from "js-yaml";
import { parseAutoSpec, type AutoCheckSpec } from "./autoCheck.js";
import { loadProjectConfig } from "./config.js";

export type CheckSeverity = "error" | "warning";

export interface ValidationCheck {
  id: string;
  description: string;
  severity: CheckSeverity;
  /** 서버가 직접 확인할 수 있는 체크면 그 방법. 없으면 지금까지대로 자기보고 대상이다. */
  auto: AutoCheckSpec | null;
}

export interface HarnessValidationConfig {
  harnessId: string;
  checks: ValidationCheck[];
}

interface RawValidationYaml {
  harnessId?: string;
  checks?: { id?: string; description?: string; severity?: string; auto?: unknown }[];
}

/**
 * 잘못된 `auto` 선언은 던진다(다른 필드의 관대한 처리와 의도적으로 다르다). 조용히 무시하면
 * "서버가 검증하는 줄 알았는데 실은 자기보고"인 체크가 생기는데, 그건 규칙이 없는 것보다 나쁘다.
 */
export function parseValidationYaml(content: string): HarnessValidationConfig {
  const raw = load(content) as RawValidationYaml | null;
  const checks: ValidationCheck[] = (raw?.checks ?? [])
    .filter((c): c is { id: string; description: string; severity: string; auto?: unknown } => !!c?.id)
    .map((c) => ({
      id: c.id,
      description: c.description ?? "",
      severity: c.severity === "error" ? "error" : "warning",
      auto: parseAutoSpec(c.auto),
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
