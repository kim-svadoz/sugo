import type { DbClient } from "../db/client.js";

// §3.7 "calibrated-ratio (유일한 실측): sugo_history 지표의 median+IQR, ≥10행 필요, 1.0~10.0 클램프".
// 플러그인이 인간공수 추정(estimatedHumanHours = ai_hours × ratio)의 고정 3.5 대신 실측 보정비율을
// 이 엔드포인트로 fetch한다(sugo/src/dashboard/fetch.ts fetchCalibratedRatio → humanHours.ts).

export interface RatioSampleRow {
  user_reported_human_hours: number | null;
  ai_execution_minutes: number | null;
}

const MIN_SAMPLES = 10;
const CLAMP_MIN = 1.0;
const CLAMP_MAX = 10.0;

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

/**
 * 순수 함수: 각 행의 관측 비율 = userReportedHumanHours / (aiExecutionMinutes/60). IQR 밖(1.5×IQR)
 * outlier를 걸러낸 뒤 중앙값을 취하고 [1.0,10.0]로 클램프한다. 유효 표본이 10개 미만이면 null
 * (실측 부족 — 플러그인은 고정 기본값으로 폴백). "실데이터만, 가짜 없음" 원칙(§0/설계안): 표본이
 * 모자라면 그럴싸한 값을 지어내지 않고 null을 반환한다.
 */
export function computeCalibratedRatio(rows: RatioSampleRow[]): number | null {
  const ratios: number[] = [];
  for (const r of rows) {
    const reported = r.user_reported_human_hours;
    const aiMin = r.ai_execution_minutes;
    if (reported === null || aiMin === null || reported <= 0 || aiMin <= 0) continue;
    ratios.push(reported / (aiMin / 60));
  }
  if (ratios.length < MIN_SAMPLES) return null;

  const sorted = [...ratios].sort((a, b) => a - b);
  const q1 = quantile(sorted, 0.25);
  const q3 = quantile(sorted, 0.75);
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const filtered = sorted.filter((x) => x >= lo && x <= hi);

  const med = median(filtered.length >= MIN_SAMPLES ? filtered : sorted);
  return Math.min(CLAMP_MAX, Math.max(CLAMP_MIN, med));
}

export async function getCalibratedRatio(db: DbClient, userId: string): Promise<number | null> {
  const rows = await db.query<RatioSampleRow>(
    "SELECT user_reported_human_hours, ai_execution_minutes FROM sugo_history WHERE user_id = ?",
    [userId],
  );
  return computeCalibratedRatio(rows);
}
