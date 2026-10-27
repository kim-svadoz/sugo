import { resolve } from "node:path";
import { z } from "zod";
import { syncProjectHarness } from "../harness/sync.js";
import { ensureWorkspace } from "../work/workspace.js";
import { assertProjectRegistrationAllowed, registerSugoProject } from "../projectRegistration.js";

export const sugoAddInputSchema = {
  projectPath: z.string().describe("등록할 프로젝트의 절대경로"),
  workspace: z.string().optional().describe("워크스페이스 이름 — 지정하면 프로젝트가 이 워크스페이스에 소속되어 prd/commit 시 Task/WorkLog가 자동 연동된다"),
  repoUrl: z.string().optional().describe("하네스 저장소 git URL(아직 미구현 — 로컬 라이브러리로 폴백)"),
  additionalStacks: z.array(z.string()).optional().describe("자동감지 결과에 추가로 강제 포함할 harnessId 목록"),
  integrationGateEnforced: z
    .boolean()
    .optional()
    .describe("PRD 정합성 게이트를 opt-in으로 강제할지(verificationPolicy). true면 test_done에 coverageMap 제출이 필수가 된다"),
  contractEvidenceRequired: z
    .boolean()
    .optional()
    .describe("계약테스트 실행증거를 opt-in으로 강제할지(verificationPolicy). true면 review_done에 red→green 전이 기록이 필수가 된다"),
};

const SugoAddArgs = z.object(sugoAddInputSchema);

/**
 * 하네스 서브시스템 진입점: 스택감지 → 하네스 fetch(로컬) → 합성 → 프로젝트에 파일쓰기
 * → config.json 저장 → registry.json 등록. 실제 동작은 harness/sync.ts에 있다(sugo_update와 공유).
 */
export async function handleSugoAdd(rawArgs: unknown) {
  const args = SugoAddArgs.parse(rawArgs);
  const projectPath = resolve(args.projectPath);
  if (args.workspace && !args.repoUrl && !args.additionalStacks && args.integrationGateEnforced === undefined && args.contractEvidenceRequired === undefined) {
    try {
      const payload = await registerSugoProject({ projectPath, workspace: args.workspace });
      return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "RETAINED_DATA_DECISION_REQUIRED") {
        return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode: error.code, message: error instanceof Error ? error.message : String(error) }, null, 2) }] };
      }
      throw error;
    }
  }

  try { await assertProjectRegistrationAllowed(); }
  catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "RETAINED_DATA_DECISION_REQUIRED") {
      return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode: error.code, message: error instanceof Error ? error.message : String(error) }, null, 2) }] };
    }
    throw error;
  }

  const result = await syncProjectHarness({ ...args, projectPath });
  if (result.workspace) await ensureWorkspace(result.workspace, projectPath);

  const payload = {
    ok: true,
    projectPath,
    projectName: result.projectName,
    workspace: result.workspace,
    detectedStack: result.config.detectedStack,
    appliedHarnesses: result.composeResult.appliedHarnesses,
    warnings: result.composeResult.warnings,
    claudeMdPath: result.claudeMdPath,
  };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}
