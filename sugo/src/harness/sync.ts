import { mkdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { atomicWriteFile } from "../fsUtil.js";
import { loadProjectConfig, projectSugoDir, saveProjectConfig, type ProjectConfig } from "./config.js";
import { hashHarnessContent } from "./contentHash.js";
import { compose, type ComposeResult } from "./harnessComposer.js";
import { fetchHarnesses } from "./harnessFetcher.js";
import { defaultHarnessLibraryDir } from "./libraryPath.js";
import { findRegistryEntry, registerProject } from "./registry.js";
import { detectStack } from "./stackDetector.js";

export interface SyncProjectHarnessArgs {
  projectPath: string;
  workspace?: string;
  repoUrl?: string;
  additionalStacks?: string[];
  integrationGateEnforced?: boolean;
  contractEvidenceRequired?: boolean;
}

export interface SyncProjectHarnessResult {
  projectName: string;
  workspace?: string;
  composeResult: ComposeResult;
  config: ProjectConfig;
  claudeMdPath: string;
}

/**
 * §2 하네스 서브시스템의 실제 동작(감지→fetch→합성→파일쓰기→config저장→레지스트리등록) — sugo_add와
 * sugo_update가 공유한다. **워크스페이스 보존:** workspace가 명시 안 되면(undefined) 기존
 * 레지스트리 엔트리의 workspace를 그대로 유지한다 — sugo_update 호출 시 workspace를 안 줬다고
 * 기존 소속이 사라지면 안 되기 때문(sugo_add로 최초 등록할 때는 애초에 기존 엔트리가 없어 자연히
 * undefined가 유지된다).
 */
export async function syncProjectHarness(args: SyncProjectHarnessArgs): Promise<SyncProjectHarnessResult> {
  const { projectPath } = args;
  const detectedStack = detectStack(projectPath);
  const harnessIds = Array.from(new Set([...detectedStack.harnessIds, ...(args.additionalStacks ?? [])]));

  const libraryDir = defaultHarnessLibraryDir();
  const { harnesses, warnings: fetchWarnings } = fetchHarnesses({ harnessIds, libraryDir, repoUrl: args.repoUrl });

  const projectName = basename(projectPath);
  const composeResult = compose({ harnesses, projectName, workspace: args.workspace, detectedStack, fetchWarnings });

  const sugoDir = projectSugoDir(projectPath);
  await mkdir(sugoDir, { recursive: true });
  await atomicWriteFile(join(sugoDir, "CLAUDE.md"), composeResult.claudeMd);
  for (const file of composeResult.harnessFiles) {
    const fullPath = join(projectPath, file.relPath);
    await mkdir(dirname(fullPath), { recursive: true });
    await atomicWriteFile(fullPath, file.content);
  }

  const now = new Date().toISOString();
  const existingConfig = await loadProjectConfig(projectPath);
  const existingEntry = await findRegistryEntry(projectPath);
  const config: ProjectConfig = {
    version: "0.1.0",
    projectPath,
    projectName,
    registeredAt: existingConfig?.registeredAt ?? now,
    lastUpdated: now,
    detectedStack,
    appliedHarnesses: harnesses.map((h) => ({ id: h.id, version: h.version, appliedAt: now, contentHash: hashHarnessContent(h) })),
    autoCommitArtifacts: existingConfig?.autoCommitArtifacts ?? true,
    disabled: existingConfig?.disabled ?? false,
    verificationPolicy:
      args.integrationGateEnforced === undefined && args.contractEvidenceRequired === undefined
        ? existingConfig?.verificationPolicy
        : {
            ...existingConfig?.verificationPolicy,
            ...(args.integrationGateEnforced !== undefined && { integrationGateEnforced: args.integrationGateEnforced }),
            ...(args.contractEvidenceRequired !== undefined && { contractEvidenceRequired: args.contractEvidenceRequired }),
          },
  };
  await saveProjectConfig(config);

  const workspace = args.workspace ?? existingEntry?.workspace;
  await registerProject({ path: projectPath, name: projectName, registeredAt: config.registeredAt, workspace });

  return {
    projectName,
    workspace,
    composeResult,
    config,
    claudeMdPath: join(sugoDir, "CLAUDE.md"),
  };
}
