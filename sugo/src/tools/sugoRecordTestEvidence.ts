import { z } from "zod";
import { loadSession, saveSession, sessionExists } from "../session.js";
import { makeTestEvidenceRecord } from "../testEvidence.js";

export const sugoRecordTestEvidenceInputSchema = {
  sessionId: z.string().describe("sugo_plan(start)으로 발급된 세션 id"),
  kind: z
    .enum(["baseline", "feature"])
    .default("feature")
    .describe("baseline=code_start 전 기존 테스트, feature=구현 후 테스트"),
  command: z.string().describe("실행한 명령(예: npm test, ./gradlew test)"),
  exitCode: z.number().optional().describe("프로세스 종료코드. 0이면 그린"),
  // 정본 파라미터명. test-agent가 부르는 계약이라 이름이 어긋나면 값이 조용히
  // undefined로 들어가 증거가 비어버린다 — 짧은 이름(total/passed/failed)도 하위호환으로
  // 받되, 정본 이름이 함께 오면 그쪽이 이긴다.
  totalTests: z.number().optional().describe("실행된 전체 테스트 수"),
  passedTests: z.number().optional().describe("통과 수"),
  failedTests: z.number().optional().describe("실패 수"),
  skippedTests: z.number().optional().describe("스킵 수"),
  rawOutput: z.string().optional().describe("원문 출력(감사용, 선택)"),
  /** @deprecated 이전 이름 — 호환용. 새 코드는 totalTests/passedTests/failedTests를 쓴다. */
  total: z.number().optional(),
  passed: z.number().optional(),
  failed: z.number().optional(),
  unverified: z.boolean().optional().describe("빌드/테스트 환경이 없어 실행 자체가 불가능했던 경우(exitCode 대신)"),
  unverifiedReason: z.string().optional().describe("unverified일 때의 사유"),
};

const SugoRecordTestEvidenceArgs = z.object(sugoRecordTestEvidenceInputSchema);

/**
 * 조작 방지의 핵심: 이 도구가 기록한 값만이 test_done/code_done 게이트가 신뢰하는 "실행 증거"다.
 * 다른 도구 파라미터의 testPassed:true 같은 자기보고 주장은 여기 기록과 대조될 뿐 그 자체로는
 * 아무것도 증명하지 않는다.
 */
export async function handleSugoRecordTestEvidence(rawArgs: unknown) {
  const args = SugoRecordTestEvidenceArgs.parse(rawArgs);

  if (!(await sessionExists(args.sessionId))) {
    return errorResult("SESSION_NOT_FOUND", `세션을 찾을 수 없습니다: ${args.sessionId}`);
  }
  const session = await loadSession(args.sessionId);

  const record = makeTestEvidenceRecord(
    args.kind,
    {
      command: args.command,
      exitCode: args.exitCode,
      total: args.totalTests ?? args.total,
      passed: args.passedTests ?? args.passed,
      failed: args.failedTests ?? args.failed,
      unverified: args.unverified,
      unverifiedReason: args.unverifiedReason,
    },
    new Date().toISOString(),
  );

  if (args.kind === "feature") record.implementationCycle = session.data.chainInfo.implementationCycle ?? 0;

  const updated =
    args.kind === "baseline"
      ? {
          ...session,
          data: {
            ...session.data,
            baselineGate: {
              required: session.data.baselineGate?.required ?? false,
              signals: session.data.baselineGate?.signals ?? [],
              evidence: record,
            },
          },
        }
      : {
          ...session,
          data: {
            ...session.data,
            chainInfo: { ...session.data.chainInfo, testEvidence: record },
          },
        };

  await saveSession(updated);

  const payload = { ok: true, sessionId: session.id, kind: args.kind, derivedState: record.derivedState };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(errorCode: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode, message }, null, 2) }],
  };
}
