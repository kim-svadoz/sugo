export function snapshotAge(observedAt: string | null, now = new Date()): { label: string; stale: boolean } {
  const observed = observedAt ? Date.parse(observedAt) : Number.NaN;
  if (!Number.isFinite(observed) || observed > now.getTime()) return { label: "동기화 기록 없음", stale: true };
  const minutes = Math.floor((now.getTime() - observed) / 60_000);
  if (minutes < 1) return { label: "방금 전", stale: false };
  if (minutes < 60) return { label: `${minutes}분 전`, stale: false };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { label: `${hours}시간 전`, stale: false };
  return { label: `${Math.floor(hours / 24)}일 전`, stale: true };
}
