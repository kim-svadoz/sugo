import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { atomicWriteFile } from "../fsUtil.js";
import type { DetectedStack } from "./types.js";

export interface AppliedHarnessMeta {
  id: string;
  version: string;
  appliedAt: string;
  contentHash?: string;
}

export interface VerificationPolicy {
  contractEvidenceRequired?: boolean;
  integrationGateEnforced?: boolean;
}

/** §9 config 스키마 */
export interface ProjectConfig {
  version: string;
  projectPath: string;
  projectName: string;
  registeredAt: string;
  lastUpdated: string;
  detectedStack: DetectedStack;
  appliedHarnesses: AppliedHarnessMeta[];
  autoCommitArtifacts?: boolean;
  /** §9: 프로젝트를 비활성 처리(sugo_disable/sugo_enable). 게이트 자체를 우회시키지는 않는다 —
   * sugo_status에 노출되는 상태 표시 용도(하드 동작 변경은 스펙에 명시돼 있지 않아 만들지 않았다). */
  disabled?: boolean;
  verificationPolicy?: VerificationPolicy;
}

export function projectSugoDir(projectPath: string): string {
  return join(projectPath, "sugo");
}

export function projectConfigPath(projectPath: string): string {
  return join(projectSugoDir(projectPath), "config.json");
}

export async function saveProjectConfig(config: ProjectConfig): Promise<void> {
  const path = projectConfigPath(config.projectPath);
  await mkdir(dirname(path), { recursive: true });
  await atomicWriteFile(path, JSON.stringify(config, null, 2));
}

export async function loadProjectConfig(projectPath: string): Promise<ProjectConfig | null> {
  try {
    const raw = await readFile(projectConfigPath(projectPath), "utf-8");
    return JSON.parse(raw) as ProjectConfig;
  } catch {
    return null;
  }
}
