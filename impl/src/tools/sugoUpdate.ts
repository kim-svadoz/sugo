import { resolve } from "node:path";
import { z } from "zod";
import { findRegistryEntry } from "../harness/registry.js";
import { syncProjectHarness } from "../harness/sync.js";

export const sugoUpdateInputSchema = {
  projectPath: z.string().describe("갱신할 프로젝트의 절대경로(이미 sugo_add로 등록돼 있어야 함)"),
  repoUrl: z.string().optional(),
  additionalStacks: z.array(z.string()).optional().describe("자동감지 결과에 추가로 강제 포함할 harnessId 목록"),
  integrationGateEnforced: z.boolean().optional(),
  contractEvidenceRequired: z.boolean().optional(),
};

const SugoUpdateArgs = z.object(sugoUpdateInputSchema);

/**
 * §9 라이프사이클 sugo_update: 이미 등록된 프로젝트의 스택감지·하네스를 다시 돈다(sugo_add와 같은
 * 실제 동작을 harness/sync.ts로 공유). sugo_add와의 차이는 딱 하나 — **등록돼 있지 않으면 거부**한다
 * (신규 등록은 sugo_add의 책임이지 update의 책임이 아니다). workspace는 명시 안 하면 기존 소속을 유지한다.
 */
export async function handleSugoUpdate(rawArgs: unknown) {
  const args = SugoUpdateArgs.parse(rawArgs);
  const projectPath = resolve(args.projectPath);

  const existing = await findRegistryEntry(projectPath);
  if (!existing) {
    return errorResult("PROJECT_NOT_REGISTERED", `등록된 프로젝트가 아닙니다. 먼저 sugo_add로 등록하세요: ${projectPath}`);
  }

  const result = await syncProjectHarness({ ...args, projectPath });

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

function errorResult(errorCode: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode, message }, null, 2) }],
  };
}
