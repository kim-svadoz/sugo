import { mkdir, readFile, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { atomicWriteFile } from "../fsUtil.js";
import { loadProjectConfig, projectSugoDir, saveProjectConfig, type ProjectConfig } from "./config.js";
import { hashHarnessContent } from "./contentHash.js";
import { compose, type ComposeResult } from "./harnessComposer.js";
import { fetchHarnesses } from "./harnessFetcher.js";
import { defaultHarnessLibraryDir } from "./libraryPath.js";
import { findRegistryEntry, registerProject } from "./registry.js";
import { writeClaudeIfChanged } from "./claudeMdFreshness.js";
import { buildClaudeRuleFile, buildEffectiveClaudeRuleFiles, mergeRootAgentsReference, mergeRootClaudeReference } from "./rulesFile.js";
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
  /** Claude Code가 자동으로 읽는 실제 진입점 — sugo/CLAUDE.md와 달리 세션 시작 시 항상 로드된다. */
  rootClaudeMdPath: string;
  /** Codex가 Sugo 체크포인트를 읽도록 연결하는 프로젝트 루트 AGENTS.md. */
  rootAgentsMdPath: string;
  claudeRulesFiles: string[];
}

async function writeTextIfChanged(path: string, content: string): Promise<void> {
  const existing = await readFile(path, "utf-8").catch(() => null);
  if (existing === content) return;
  await atomicWriteFile(path, content);
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
  const existingConfig = await loadProjectConfig(projectPath);
  const existingEntry = await findRegistryEntry(projectPath);
  const workspace = args.workspace ?? existingEntry?.workspace;
  const detectedStack = detectStack(projectPath);
  const harnessIds = Array.from(new Set([...detectedStack.harnessIds, ...(args.additionalStacks ?? [])]));

  const libraryDir = defaultHarnessLibraryDir();
  const { harnesses, warnings: fetchWarnings } = fetchHarnesses({ harnessIds, libraryDir, repoUrl: args.repoUrl });

  const projectName = basename(projectPath);
  const composeResult = compose({ harnesses, projectName, workspace, detectedStack, fetchWarnings });

  const sugoDir = projectSugoDir(projectPath);
  const claudeMdPath = join(sugoDir, "CLAUDE.md");
  await mkdir(sugoDir, { recursive: true });
  // 내용이 안 바뀌었으면 재기록을 생략한다(§2 step 4 writeClaudeIfChanged) — 그래야 안 건드린
  // 프로젝트를 재동기화만 해도 git이 dirty해지는 걸 피한다.
  const existingClaudeMd = await readFile(claudeMdPath, "utf-8").catch(() => null);
  const claudeMdResult = writeClaudeIfChanged(existingClaudeMd, composeResult.claudeMd, new Date().toISOString());
  if (claudeMdResult.changed) await atomicWriteFile(claudeMdPath, claudeMdResult.content);
  for (const file of composeResult.harnessFiles) {
    const fullPath = join(projectPath, file.relPath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeTextIfChanged(fullPath, file.content);
  }

  // Claude Code는 `.claude/rules/*.md`를 재귀 자동로드한다 — 이게 실제 "규칙이 알아서 컨텍스트에
  // 들어오는" 경로다(sugo/harness/**는 sugo_get_project_context를 명시 호출해야만 읽힌다).
  const claudeRulesDir = join(projectPath, ".claude", "rules");
  await mkdir(claudeRulesDir, { recursive: true });
  const effectiveRuleFiles = buildEffectiveClaudeRuleFiles(harnesses);
  for (const ruleFile of effectiveRuleFiles) {
    await writeTextIfChanged(join(projectPath, ruleFile.relPath), ruleFile.content);
  }
  // 더 이상 적용되지 않는 하네스의 규칙 파일은 지운다 — 안 지우면 제거된 스택의 규칙이 계속
  // 자동로드된다(예: Next를 뺐는데 Next 규칙이 계속 붙는 조용한 misleading).
  const currentRulePaths = new Set(effectiveRuleFiles.map((file) => file.relPath));
  const previousIds = existingConfig?.appliedHarnesses.map((h) => h.id) ?? [];
  for (const staleId of previousIds.filter((id) => !currentRulePaths.has(buildClaudeRuleFile(id, "").relPath))) {
    const stalePath = join(projectPath, buildClaudeRuleFile(staleId, "").relPath);
    await unlink(stalePath).catch(() => {}); // 이미 없으면(수동 삭제 등) 무시
  }

  // 루트 CLAUDE.md는 Claude Code가 세션 시작 시 항상 읽는 파일이다 — 사람이 쓴 내용은 보존하고
  // sugo 관리 블록만 교체한다.
  const rootClaudePath = join(projectPath, "CLAUDE.md");
  const existingRootClaude = await readFile(rootClaudePath, "utf-8").catch(() => null);
  const rootClaude = mergeRootClaudeReference(existingRootClaude, harnesses.map((h) => h.id));
  if (rootClaude.changed) await atomicWriteFile(rootClaudePath, rootClaude.content);

  const rootAgentsPath = join(projectPath, "AGENTS.md");
  const existingRootAgents = await readFile(rootAgentsPath, "utf-8").catch(() => null);
  const rootAgents = mergeRootAgentsReference(existingRootAgents);
  if (rootAgents.changed) await atomicWriteFile(rootAgentsPath, rootAgents.content);

  const now = new Date().toISOString();
  const candidateConfig: ProjectConfig = {
    version: "0.1.0",
    projectPath,
    projectName,
    registeredAt: existingConfig?.registeredAt ?? now,
    lastUpdated: now,
    detectedStack,
    appliedHarnesses: harnesses.map((h) => {
      const contentHash = hashHarnessContent(h);
      const previous = existingConfig?.appliedHarnesses.find((item) =>
        item.id === h.id && item.version === h.version && item.contentHash === contentHash,
      );
      return { id: h.id, version: h.version, appliedAt: previous?.appliedAt ?? now, contentHash };
    }),
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
  const unchanged = existingConfig !== null
    && JSON.stringify({ ...candidateConfig, lastUpdated: existingConfig.lastUpdated }) === JSON.stringify(existingConfig);
  const config = unchanged ? existingConfig : candidateConfig;
  if (!unchanged) await saveProjectConfig(config);

  await registerProject({ path: projectPath, name: projectName, registeredAt: config.registeredAt, workspace });

  return {
    projectName,
    workspace,
    composeResult,
    config,
    claudeMdPath,
    rootClaudeMdPath: rootClaudePath,
    rootAgentsMdPath: rootAgentsPath,
    claudeRulesFiles: harnesses.map((h) => buildClaudeRuleFile(h.id, "").relPath),
  };
}
