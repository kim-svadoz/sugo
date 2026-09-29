import { z } from "zod";
import { evaluateAutoCheck } from "../harness/autoCheck.js";
import { createFsDetectionContext } from "../harness/context.js";
import { loadProjectValidationConfigs, type HarnessValidationConfig } from "../harness/validationConfig.js";
import { loadSession, saveSession, sessionExists } from "../session.js";
import { computeValidationVerdict, type AutoVerifiedResult } from "../validate.js";

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
 * 프로젝트에 적용된 하네스의 auto 체크를 서버가 직접 돌린다. 제출 여부와 무관하게 실행되므로
 * 이 부분집합에 한해서는 "검증 안 함"과 "다 통과"가 구분된다.
 */
function runAutoChecks(
  projectPath: string,
  changedFiles: string[],
  configs: Map<string, HarnessValidationConfig>,
): Map<string, AutoVerifiedResult> {
  const ctx = createFsDetectionContext(projectPath, changedFiles);
  const out = new Map<string, AutoVerifiedResult>();
  for (const [harnessId, config] of configs) {
    for (const check of config.checks) {
      if (!check.auto) continue;
      const { passed, detail } = evaluateAutoCheck(check.auto, ctx);
      out.set(`${harnessId}#${check.id}`, { harnessId, checkId: check.id, passed, detail });
    }
  }
  return out;
}

/**
 * §5 review 단계 진입점. 제출된 결과를 프로젝트에 실제 정의된 validation.yaml과 대조하고
 * (존재하지 않는 checkId는 fabricated로 분리), `auto`가 선언된 체크는 서버가 직접 실측해
 * **자기보고보다 실측을 우선**한다(§4.3 런타임 게이트와 같은 원칙).
 *
 * 여전히 review_done의 하드 게이트로 연결하지는 않는다. 자기보고 체크에는 "제출 자체가 없으면
 * 자동 pass"라는 한계가 그대로 남아서다(test/validate.test.ts에 고정). 다만 auto 체크는 그
 * 한계가 없으므로, 게이트로 승격한다면 auto로 검증된 실패만이 그 대상이 된다.
 */
export async function handleSugoValidate(rawArgs: unknown) {
  const args = SugoValidateArgs.parse(rawArgs);

  if (!(await sessionExists(args.sessionId))) {
    return errorResult("SESSION_NOT_FOUND", `세션을 찾을 수 없습니다: ${args.sessionId}`);
  }
  const session = await loadSession(args.sessionId);

  const configs = await loadProjectValidationConfigs(session.projectPath);
  const autoResults = runAutoChecks(session.projectPath, session.data.chainInfo.changedFiles, configs);
  const result = computeValidationVerdict(args.validationResults, configs, autoResults);

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
          contradictionCount: result.contradictions.length,
          autoVerifiedCount: autoResults.size,
          verifiedFailures: result.results
            .filter((r) => r.source === "verified" && !r.passed && r.severity === "error")
            .map((r) => ({ harnessId: r.harnessId, checkId: r.checkId, detail: r.detail ?? "" })),
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
    contradictions: result.contradictions,
    autoVerifiedCount: autoResults.size,
  };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(errorCode: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode, message }, null, 2) }],
  };
}
