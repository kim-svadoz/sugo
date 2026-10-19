import { z } from "zod";
import { applyContractPhase } from "../contractEvidence.js";
import { loadSession, saveSession, sessionExists } from "../session.js";

export const sugoRecordContractEvidenceInputSchema = {
  sessionId: z.string().describe("sugo_plan(start)으로 발급된 세션 id"),
  contractId: z.string().describe("계약(요구사항 단위) 식별자 — 같은 id로 red/green을 각각 기록"),
  phase: z.enum(["red", "green"]).describe("red=구현 전 실패 확인, green=구현 후 통과 확인"),
  command: z.string().describe("실행한 명령"),
  exitCode: z.number().describe("프로세스 종료코드"),
};

const SugoRecordContractEvidenceArgs = z.object(sugoRecordContractEvidenceInputSchema);

/**
 * 계약테스트 실행증거: red(구현 전 실패)와 green(구현 후 통과)을 각각 별도 호출로 기록해야
 * review_done의 contractEvidenceRequired 게이트가 신뢰한다. 한 번에 "다 통과했다"고 자기보고할 수 없다.
 */
export async function handleSugoRecordContractEvidence(rawArgs: unknown) {
  const args = SugoRecordContractEvidenceArgs.parse(rawArgs);

  if (!(await sessionExists(args.sessionId))) {
    return errorResult("SESSION_NOT_FOUND", `세션을 찾을 수 없습니다: ${args.sessionId}`);
  }
  const session = await loadSession(args.sessionId);

  const existingRecords = session.data.chainInfo.contractTests ?? [];
  const existingRecord = existingRecords.find((r) => r.contractId === args.contractId);
  const updatedRecord = applyContractPhase(existingRecord, args.contractId, args.phase, args.exitCode, new Date().toISOString());
  const contractTests = [...existingRecords.filter((r) => r.contractId !== args.contractId), updatedRecord];

  await saveSession({
    ...session,
    data: { ...session.data, chainInfo: { ...session.data.chainInfo, contractTests } },
  });

  const payload = { ok: true, sessionId: session.id, contractId: args.contractId, record: updatedRecord };
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function errorResult(errorCode: string, message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, errorCode, message }, null, 2) }],
  };
}
