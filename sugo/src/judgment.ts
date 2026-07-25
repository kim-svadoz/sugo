import type { PlanSession } from "./types.js";

export interface JudgmentGap {
  sessionId: string;
  gapMinutes: number;
}

export interface JudgmentReport {
  totalSessions: number;
  /** 1차 완료가 동작 도달 못 해 patch로 재진입한 세션 수. */
  patchSessions: number;
  /** review_done 완료선언 → commit(DONE) 실동작까지의 갭. 데이터 없으면 null. */
  avgReviewToCommitMinutes: number | null;
  maxReviewToCommitMinutes: number | null;
  topGaps: JudgmentGap[];
  /** 환경부재(우회구) 남용률 — test/baseline evidence unverified, boot/runtime unverified 라벨 중 하나라도 쓴 세션 비율. */
  environmentAbsentRate: number;
  /** auto-loop(code_start 역방향 재진입) 총 재시도 횟수와 그런 세션 수. */
  reviewLoopRetryTotal: number;
  sessionsWithReviewLoop: number;
  /** review_done의 runtimeCheck.unverifiedReason 라벨을 사용한 세션 수. */
  runtimeUnverifiedSessions: number;
  /** code_done의 bootUnverifiedReason 라벨을 사용한 세션 수. */
  bootUnverifiedSessions: number;
  /** sugo_validate에서 존재하지 않는 checkId가 하나라도 보고된 세션 수(§5 도구 재사용 시그널). */
  fabricatedValidationSessions: number;
}

function minutesBetween(fromIso: string, toIso: string): number {
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000;
}

/**
 * §4.5: 파이프라인에 배선되지 않는 관측 계층 — 게이트를 막지 않고, 누적된 세션 신호를 횡단
 * 집계해 "게이트가 새고 있나"를 한 장으로 낸다. 순수 함수(입력=세션 배열, 부수효과 없음).
 * 스펙의 followUpDefectsTotal(완료 후 결함)은 외부 이슈트래커 연동 없이는 계측 불가라 이번
 * 빌드에는 없음 — Jira 등은 스코프 밖(§12).
 */
export function computeJudgmentReport(sessions: PlanSession[]): JudgmentReport {
  const total = sessions.length;
  const patchSessions = sessions.filter((s) => s.data.mode === "patch").length;

  const gaps: JudgmentGap[] = [];
  for (const s of sessions) {
    const reviewDoneAt = s.data.chainInfo.reviewDoneAt;
    if (s.state === "DONE" && reviewDoneAt) {
      gaps.push({ sessionId: s.id, gapMinutes: Math.max(0, minutesBetween(reviewDoneAt, s.updatedAt)) });
    }
  }
  const avgReviewToCommitMinutes =
    gaps.length > 0 ? gaps.reduce((sum, g) => sum + g.gapMinutes, 0) / gaps.length : null;
  const maxReviewToCommitMinutes = gaps.length > 0 ? Math.max(...gaps.map((g) => g.gapMinutes)) : null;
  const topGaps = [...gaps].sort((a, b) => b.gapMinutes - a.gapMinutes).slice(0, 5);

  let environmentAbsentCount = 0;
  let runtimeUnverifiedSessions = 0;
  let bootUnverifiedSessions = 0;
  let fabricatedValidationSessions = 0;
  let reviewLoopRetryTotal = 0;
  let sessionsWithReviewLoop = 0;

  for (const s of sessions) {
    const usedUnverifiedTest = s.data.chainInfo.testEvidence?.derivedState === "unverified";
    const usedUnverifiedBaseline = s.data.baselineGate?.evidence?.derivedState === "unverified";
    const usedRuntimeLabel = !!s.data.chainInfo.runtimeCheckUnverifiedReason;
    const usedBootLabel = !!s.data.chainInfo.codeGateAudit?.bootUnverifiedReason;
    if (usedUnverifiedTest || usedUnverifiedBaseline || usedRuntimeLabel || usedBootLabel) environmentAbsentCount++;
    if (usedRuntimeLabel) runtimeUnverifiedSessions++;
    if (usedBootLabel) bootUnverifiedSessions++;
    if ((s.data.chainInfo.lastValidation?.fabricatedCount ?? 0) > 0) fabricatedValidationSessions++;

    const retries = s.data.chainInfo.autoLoopRetryCount;
    reviewLoopRetryTotal += retries;
    if (retries > 0) sessionsWithReviewLoop++;
  }

  return {
    totalSessions: total,
    patchSessions,
    avgReviewToCommitMinutes,
    maxReviewToCommitMinutes,
    topGaps,
    environmentAbsentRate: total > 0 ? environmentAbsentCount / total : 0,
    reviewLoopRetryTotal,
    sessionsWithReviewLoop,
    runtimeUnverifiedSessions,
    bootUnverifiedSessions,
    fabricatedValidationSessions,
  };
}
