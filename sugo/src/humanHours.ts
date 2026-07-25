export interface HumanHoursEstimate {
  aiExecutionMinutes: number;
  estimatedHumanHours: number;
  estimationBasis: string;
}

/** 설계안: "AI 실행분 × 보정비율(≈3.x) + 복잡도(요구수·재시도) 가산. 정밀치 아님." */
const DEFAULT_RATIO = 3.5;

/**
 * HULK(§8)의 전체 워크로그/자동보정 루프는 아직 없다 — review_done 응답에 참고용 추정치만
 * 실어준다. 사람이 실제 시간을 확인해 자동보정하는 루프는 HULK 구현 단계에서 붙일 것.
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
