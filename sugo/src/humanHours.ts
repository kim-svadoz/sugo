export interface HumanHoursEstimate {
  aiExecutionMinutes: number;
  estimatedHumanHours: number;
  estimationBasis: string;
}

/** 설계안: "AI 실행분 × 보정비율(≈3.x) + 복잡도(요구수·재시도) 가산. 정밀치 아님." */
const DEFAULT_RATIO = 3.5;

/**
 * review_done 응답에 싣는 **참고용** 추정치다(정밀치 아님).
 *
 * `ratio`는 주입받는다 — 호출부(sugoPlan review_done)가 대시보드의 실측 보정비율을
 * fetch해 넘기고, 대시보드가 없거나 실패하면 여기 기본값 3.5로 폴백한다.
 */
export function estimateHumanHours(
  startedAtIso: string,
  nowIso: string,
  analyzeAttempts: number,
  autoLoopRetryCount: number,
  ratio = DEFAULT_RATIO,
): HumanHoursEstimate {
  const startMs = new Date(startedAtIso).getTime();
  const nowMs = new Date(nowIso).getTime();
  const aiExecutionMinutes = Math.max(0, (nowMs - startMs) / 60000);

  const base = (aiExecutionMinutes / 60) * ratio;
  const complexity = analyzeAttempts * 0.1 + autoLoopRetryCount * 0.15;
  const estimatedHumanHours = Math.round((base + complexity) * 100) / 100;

  return {
    aiExecutionMinutes: Math.round(aiExecutionMinutes * 10) / 10,
    estimatedHumanHours,
    estimationBasis: `AI 실행 ${Math.round(aiExecutionMinutes)}분 × 보정비율 ${ratio} + 복잡도(analyze ${analyzeAttempts}회×0.1 + auto-loop 재시도 ${autoLoopRetryCount}회×0.15)`,
  };
}
