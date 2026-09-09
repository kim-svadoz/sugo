import { z } from "zod";
import { loadProjectValidationConfigs } from "../harness/validationConfig.js";
import { loadSession, saveSession, sessionExists } from "../session.js";
import { computeValidationVerdict } from "../validate.js";

export const sugoValidateInputSchema = {
  sessionId: z.string().describe("sugo_plan(start)으로 발급된 세션 id"),
  validationResults: z
    .array(
      z.object({
        harnessId: z.string(),
        checkId: z.string(),
        passed: z.boolean(),
        note: z.string().optional(),
      }),
    )
    .describe("review-agent가 각 하네스 validation.yaml 체크 항목별로 판정한 결과"),
};

const SugoValidateArgs = z.object(sugoValidateInputSchema);

/**
 * §5 review 단계 진입점. 제출된 결과를 프로젝트에 실제 정의된 validation.yaml과 대조한다
 * (존재하지 않는 checkId는 fabricated로 분리 — computeValidationVerdict 참고).
 * review_done의 하드 게이트로 연결하지 않는다: "제출 자체가 없으면 자동 pass"가 되는 한계가
 * 있어서다(test/validate.test.ts에 고정). 하드 게이트로 쓰려면 "최소 N개 이상 제출 필수" 같은
 * 규칙이 먼저 필요하다.
 */
export async function handleSugoValidate(rawArgs: unknown) {
  const args = SugoValidateArgs.parse(rawArgs);

  if (!(await sessionExists(args.sessionId))) {
    return errorResult("SESSION_NOT_FOUND", `세션을 찾을 수 없습니다: ${args.sessionId}`);
  }
  const session = await loadSession(args.sessionId);

  const configs = await loadProjectValidationConfigs(session.projectPath);
  const result = computeValidationVerdict(args.validationResults, configs);

  const updated = {
    ...session,
    data: {
      ...session.data,
      chainInfo: {
        ...session.data.chainInfo,
        lastValidation: {
          verdict: result.verdict,
          checkedAt: new Date().toISOString(),
          fabricatedCount: result.fabricated.length,
        },
      },
    },
  };
  await saveSession(updated);

  const payload = {
    ok: true,
    sessionId: session.id,
    verdict: result.verdict,
    results: result.results,
    fabricated: result.fabricated,
    uncoveredChecks: result.uncoveredChecks,
  };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(errorCode: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode, message }, null, 2) }],
  };
}
