// 플러그인은 ISO 8601 문자열(`2026-01-02T00:00:00.000Z`)로 타임스탬프를 보내지만, MySQL의
// TIMESTAMP/DATETIME 컬럼은 `T`/`Z`/밀리초가 붙은 ISO를 거부한다(ER_TRUNCATED_WRONG_VALUE) —
// `YYYY-MM-DD HH:MM:SS[.fff]`(공백 구분, UTC)를 기대한다. **SQLite는 TEXT라 입력값을 그대로 받으므로
// 이 불일치는 SQLite 테스트로는 절대 안 드러난다** — 실물 MySQL로만 잡힌다.
//
// 이 헬퍼가 두 드라이버 모두에서 안전한 형태로 정규화한다: ISO를 UTC 기준 `YYYY-MM-DD HH:MM:SS.fff`로
// 변환한다. **datetime 컬럼 전용**이므로(호출부가 started_at/completed_at 등에만 적용) 파싱
// 불가한 값은 null로 떨군다 — garbage 문자열을 그대로 넘기면 MySQL이 INSERT 자체를 거부해
// (ER_TRUNCATED_WRONG_VALUE) 요청이 크래시/행되기 때문이다.
export function toDbDateTime(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null; // datetime 컬럼엔 garbage보다 null이 안전
  // toISOString() = `YYYY-MM-DDTHH:MM:SS.fffZ` → `T`→공백, 끝의 `Z` 제거 = MySQL/SQLite 공용 형태.
  return d.toISOString().replace("T", " ").replace("Z", "");
}
