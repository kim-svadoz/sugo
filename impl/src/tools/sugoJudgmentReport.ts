import { z } from "zod";
import { computeJudgmentReport } from "../judgment.js";
import { loadAllSessions } from "../session.js";

export const sugoJudgmentReportInputSchema = {
  windowDays: z.number().optional().describe("최근 N일 이내 갱신된 세션만 집계(미지정시 전체 세션)"),
};

const SugoJudgmentReportArgs = z.object(sugoJudgmentReportInputSchema);

/** §4.5: 파이프라인 비배선 관측 계층. 게이트를 막지 않고 세션 신호를 횡단 집계해 리포트만 반환한다. */
export async function handleSugoJudgmentReport(rawArgs: unknown) {
  const args = SugoJudgmentReportArgs.parse(rawArgs);
  const allSessions = await loadAllSessions();

  const sessions =
    args.windowDays === undefined
      ? allSessions
      : allSessions.filter((s) => {
          const ageMs = Date.now() - new Date(s.updatedAt).getTime();
          return ageMs <= args.windowDays! * 24 * 60 * 60 * 1000;
        });

  const report = computeJudgmentReport(sessions);
  return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, report }, null, 2) }] };
}
