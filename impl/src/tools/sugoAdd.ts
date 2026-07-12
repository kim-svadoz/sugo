import { mkdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { z } from "zod";
import { atomicWriteFile } from "../fsUtil.js";
import { loadProjectConfig, projectSugoDir, saveProjectConfig, type ProjectConfig } from "../harness/config.js";
import { hashHarnessContent } from "../harness/contentHash.js";
import { compose } from "../harness/harnessComposer.js";
import { fetchHarnesses } from "../harness/harnessFetcher.js";
import { defaultHarnessLibraryDir } from "../harness/libraryPath.js";
import { registerProject } from "../harness/registry.js";
import { detectStack } from "../harness/stackDetector.js";
import { ensureWorkspace } from "../hulk/workspace.js";

export const sugoAddInputSchema = {
  projectPath: z.string().describe("등록할 프로젝트의 절대경로"),
  workspace: z.string().optional().describe("HULK 워크스페이스 이름 — 지정하면 프로젝트가 이 워크스페이스에 소속되어 prd/commit 시 Task/WorkLog가 자동 연동된다(§8)"),
  repoUrl: z.string().optional().describe("하네스 저장소 git URL(현재 빌드는 미구현 — 로컬 라이브러리로 폴백)"),
  additionalStacks: z.array(z.string()).optional().describe("자동감지 결과에 추가로 강제 포함할 harnessId 목록"),
  integrationGateEnforced: z
    .boolean()
    .optional()
    .describe("§10 PRD 정합성 게이트를 opt-in으로 강제할지(verificationPolicy). true면 test_done에 coverageMap 제출이 필수가 된다"),
};

const SugoAddArgs = z.object(sugoAddInputSchema);

/**
 * §2 하네스 서브시스템 진입점: 스택감지 → 하네스 fetch(로컬) → 합성 → 프로젝트에 파일쓰기
 * → config.json 저장 → registry.json 등록.
 */
export async function handleSugoAdd(rawArgs: unknown) {
  const args = SugoAddArgs.parse(rawArgs);
  const projectPath = resolve(args.projectPath);

  const detectedStack = detectStack(projectPath);
  const harnessIds = Array.from(new Set([...detectedStack.harnessIds, ...(args.additionalStacks ?? [])]));

  const libraryDir = defaultHarnessLibraryDir();
  const { harnesses, warnings: fetchWarnings } = fetchHarnesses({
    harnessIds,
    libraryDir,
    repoUrl: args.repoUrl,
  });

  const projectName = basename(projectPath);
  const composeResult = compose({
    harnesses,
    projectName,
    workspace: args.workspace,
    detectedStack,
    fetchWarnings,
  });

  const sugoDir = projectSugoDir(projectPath);
  await mkdir(sugoDir, { recursive: true });
  await atomicWriteFile(join(sugoDir, "CLAUDE.md"), composeResult.claudeMd);
  for (const file of composeResult.harnessFiles) {
    const fullPath = join(projectPath, file.relPath);
    await mkdir(dirname(fullPath), { recursive: true });
    await atomicWriteFile(fullPath, file.content);
  }

  const now = new Date().toISOString();
  const existing = await loadProjectConfig(projectPath);
  const config: ProjectConfig = {
    version: "0.1.0",
    projectPath,
    projectName,
    registeredAt: existing?.registeredAt ?? now,
    lastUpdated: now,
    detectedStack,
    appliedHarnesses: harnesses.map((h) => ({
      id: h.id,
      version: h.version,
      appliedAt: now,
      contentHash: hashHarnessContent(h),
    })),
    autoCommitArtifacts: existing?.autoCommitArtifacts ?? true,
    verificationPolicy:
      args.integrationGateEnforced === undefined
        ? existing?.verificationPolicy
        : { ...existing?.verificationPolicy, integrationGateEnforced: args.integrationGateEnforced },
  };
  await saveProjectConfig(config);
  await registerProject({
    path: projectPath,
    name: projectName,
    registeredAt: config.registeredAt,
    workspace: args.workspace,
  });

  if (args.workspace) {
    await ensureWorkspace(args.workspace, projectPath);
  }

  const payload = {
    ok: true,
    projectPath,
    projectName,
    workspace: args.workspace,
    detectedStack,
    appliedHarnesses: composeResult.appliedHarnesses,
    warnings: composeResult.warnings,
    claudeMdPath: join(sugoDir, "CLAUDE.md"),
  };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
